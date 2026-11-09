import Stripe from "stripe";
import { withContext, type Sql } from "../db";
import { audit } from "./audit";
import { ForbiddenError, UserError } from "./errors";
import { inOrg, type OrgContext } from "./orgs";

export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_ID);
}

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new UserError("Billing is not configured.");
  return new Stripe(key);
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Start a Stripe Checkout session for the Pro plan. Owners only. */
export async function createCheckout(db: Sql, ctx: OrgContext, email: string): Promise<string> {
  if (ctx.role !== "owner") throw new ForbiddenError("Only owners can manage billing.");
  if (!billingEnabled()) throw new UserError("Billing is not configured.");
  const client = stripe();

  let customerId = ctx.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({ email, metadata: { org_id: ctx.orgId } });
    customerId = customer.id;
    await inOrg(db, ctx, (tx) => tx`update organizations set stripe_customer_id = ${customerId} where id = ${ctx.orgId}`);
  }

  // org_id travels in Stripe metadata that only our server sets; the webhook trusts it
  // only after verifying Stripe's signature.
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${appUrl()}/app/${ctx.slug}/billing?status=success`,
    cancel_url: `${appUrl()}/app/${ctx.slug}/billing?status=cancelled`,
    metadata: { org_id: ctx.orgId },
    subscription_data: { metadata: { org_id: ctx.orgId } },
  });
  if (!session.url) throw new UserError("Couldn't start checkout.");
  return session.url;
}

export async function createPortal(ctx: OrgContext): Promise<string> {
  if (ctx.role !== "owner") throw new ForbiddenError("Only owners can manage billing.");
  if (!ctx.stripeCustomerId) throw new UserError("No billing account yet.");
  const portal = await stripe().billingPortal.sessions.create({
    customer: ctx.stripeCustomerId,
    return_url: `${appUrl()}/app/${ctx.slug}/billing`,
  });
  return portal.url;
}

/** Verify a webhook payload. Throws if the signature is missing, wrong, or too old. */
export function verifyWebhook(payload: string, signature: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET): Stripe.Event {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

const ACTIVE = new Set(["active", "trialing", "past_due"]);

/** Apply a verified Stripe event to the organization's plan. Returns whether it changed anything. */
export async function applyBillingEvent(db: Sql, event: Stripe.Event): Promise<boolean> {
  let orgId: string | undefined;
  let plan: "free" | "pro" | undefined;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    orgId = session.metadata?.org_id;
    plan = session.payment_status === "paid" || session.status === "complete" ? "pro" : undefined;
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    orgId = subscription.metadata?.org_id;
    plan = event.type === "customer.subscription.updated" && ACTIVE.has(subscription.status) ? "pro" : "free";
  }

  if (!orgId || !plan || !/^[0-9a-f-]{36}$/.test(orgId)) return false;
  const targetPlan = plan;
  return withContext(db, { orgId }, async (tx) => {
    const updated = await tx`update organizations set plan = ${targetPlan} where id = ${orgId} and plan <> ${targetPlan} returning id`;
    if (updated.length === 0) return false;
    await audit(tx, { orgId: orgId!, actorId: null, action: "billing.plan_changed", target: targetPlan, metadata: { event: event.type } });
    return true;
  });
}
