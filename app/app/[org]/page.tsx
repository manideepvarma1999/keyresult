import type { Metadata } from "next";
import Link from "next/link";
import { createObjectiveAction } from "@/app/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input, ProgressBar, StatusBadge, Textarea } from "@/components/ui";
import { orgFromSlug } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { currentQuarter, objectiveProgress, progress, shiftQuarter, STATUS_LABEL } from "@/lib/okr";
import { PLAN_LIMITS } from "@/lib/permissions";
import { listObjectives } from "@/lib/services/okrs";
import { quarter as quarterSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Objectives" };

export default async function ObjectivesPage({ params, searchParams }: PageProps<"/app/[org]">) {
  const { org } = await params;
  const ctx = await orgFromSlug(org);
  const requested = quarterSchema.safeParse((await searchParams).q);
  const quarter = requested.success ? requested.data : currentQuarter();
  const objectives = await listObjectives(getDb(), ctx, quarter);
  const limit = PLAN_LIMITS[ctx.plan].objectivesPerQuarter;
  const base = `/app/${ctx.slug}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section>
        <div className="mb-4 flex items-center gap-3">
          <Link href={`${base}?q=${shiftQuarter(quarter, -1)}`} aria-label="Previous quarter" className="rounded-lg px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">←</Link>
          <h2 className="text-lg font-semibold tabular-nums">{quarter}</h2>
          <Link href={`${base}?q=${shiftQuarter(quarter, 1)}`} aria-label="Next quarter" className="rounded-lg px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">→</Link>
          <span className="ml-auto text-sm text-zinc-500">
            {objectives.length}
            {Number.isFinite(limit) ? ` / ${limit}` : ""} objectives
          </span>
        </div>

        {objectives.length === 0 ? (
          <Card>
            <p className="text-zinc-600 dark:text-zinc-400">No objectives for {quarter} yet. Add the first one on the right.</p>
          </Card>
        ) : (
          <ul className="space-y-4">
            {objectives.map((o) => (
              <li key={o.id}>
                <Link
                  href={`${base}/objectives/${o.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{o.title}</h3>
                    <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">Owner: {o.owner_name ?? "unassigned"}</p>
                  <div className="mt-3">
                    <ProgressBar value={objectiveProgress(o.key_results)} label={`${o.title} progress`} />
                  </div>
                  {o.key_results.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {o.key_results.map((kr) => (
                        <li key={kr.id} className="flex justify-between gap-3">
                          <span className="truncate">{kr.title}</span>
                          <span className="tabular-nums">{progress(kr)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="h-fit">
        <h2 className="mb-4 font-semibold">New objective for {quarter}</h2>
        <ActionForm action={createObjectiveAction} submitLabel="Add objective" hidden={{ org: ctx.slug, quarter }} resetOnSuccess>
          <Field label="Objective">
            <Input name="title" required maxLength={200} placeholder="Make onboarding delightful" />
          </Field>
          <Field label="Why it matters (optional)">
            <Textarea name="description" rows={3} maxLength={2000} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
