import { getDb } from "@/lib/db";
import { applyBillingEvent, billingEnabled, verifyWebhook } from "@/lib/services/billing";

export async function POST(request: Request): Promise<Response> {
  if (!billingEnabled()) return new Response("Billing disabled", { status: 404 });

  // The raw body is needed: the signature covers the exact bytes Stripe sent.
  const payload = await request.text();
  let event;
  try {
    event = verifyWebhook(payload, request.headers.get("stripe-signature"));
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  await applyBillingEvent(getDb(), event);
  return Response.json({ received: true });
}
