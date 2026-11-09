import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkoutAction, portalAction } from "@/app/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Card } from "@/components/ui";
import { orgFromSlug } from "@/lib/actions";
import { PLAN_LIMITS } from "@/lib/permissions";
import { billingEnabled } from "@/lib/services/billing";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ params, searchParams }: PageProps<"/app/[org]/billing">) {
  const { org } = await params;
  const ctx = await orgFromSlug(org);
  if (ctx.role !== "owner") notFound();
  const status = (await searchParams).status;
  const free = PLAN_LIMITS.free;

  return (
    <div className="max-w-2xl space-y-6">
      {status === "success" && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Payment received. Your plan updates as soon as Stripe confirms it, usually within a few seconds.
        </p>
      )}
      <Card>
        <h2 className="font-semibold">Current plan: <span className="uppercase text-indigo-600">{ctx.plan}</span></h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Free includes {free.members} members and {free.objectivesPerQuarter} objectives per quarter. Pro removes both limits.
        </p>
        <div className="mt-5">
          {!billingEnabled() ? (
            <p className="text-sm text-zinc-500">
              Billing isn&apos;t configured on this server. Set the STRIPE_* variables (test mode keys) to enable it.
            </p>
          ) : ctx.plan === "free" ? (
            <ActionForm action={checkoutAction} submitLabel="Upgrade to Pro" hidden={{ org: ctx.slug }} />
          ) : (
            <ActionForm action={portalAction} submitLabel="Manage subscription" hidden={{ org: ctx.slug }} variant="secondary" />
          )}
        </div>
      </Card>
    </div>
  );
}
