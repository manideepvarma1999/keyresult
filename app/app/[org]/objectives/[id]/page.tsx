import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  addKeyResultAction,
  checkInAction,
  deleteKeyResultAction,
  deleteObjectiveAction,
  setStatusAction,
} from "@/app/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { buttonClass, Card, Field, Input, ProgressBar, Select, StatusBadge } from "@/components/ui";
import { orgFromSlug } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { objectiveProgress, progress, STATUS_LABEL } from "@/lib/okr";
import { hasRole } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { getObjective } from "@/lib/services/okrs";
import { uuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Objective" };

const number = (v: string) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default async function ObjectivePage({ params }: PageProps<"/app/[org]/objectives/[id]">) {
  const { org, id } = await params;
  const ctx = await orgFromSlug(org);
  if (!uuid.safeParse(id).success) notFound();

  let data;
  try {
    data = await getObjective(getDb(), ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { objective, checkIns } = data;
  const canEdit = objective.owner_id === ctx.userId || hasRole(ctx.role, "admin");
  const hidden = { org: ctx.slug, objectiveId: objective.id };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500">{objective.quarter} · Owner: {objective.owner_name ?? "unassigned"}</p>
              <h2 className="mt-1 text-xl font-semibold">{objective.title}</h2>
            </div>
            <StatusBadge status={objective.status} label={STATUS_LABEL[objective.status]} />
          </div>
          {objective.description && <p className="mt-3 whitespace-pre-line text-zinc-600 dark:text-zinc-400">{objective.description}</p>}
          <div className="mt-4">
            <ProgressBar value={objectiveProgress(objective.key_results)} label="Objective progress" />
          </div>
        </Card>

        <section className="space-y-4">
          <h3 className="font-semibold">Key results</h3>
          {objective.key_results.length === 0 && <p className="text-sm text-zinc-500">No key results yet.</p>}
          {objective.key_results.map((kr) => (
            <Card key={kr.id}>
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-medium">{kr.title}</h4>
                {canEdit && (
                  <form action={deleteKeyResultAction}>
                    <input type="hidden" name="org" value={ctx.slug} />
                    <input type="hidden" name="keyResultId" value={kr.id} />
                    <button className="text-xs text-zinc-500 hover:text-red-600" aria-label={`Delete ${kr.title}`}>Delete</button>
                  </form>
                )}
              </div>
              <p className="mt-1 text-sm tabular-nums text-zinc-500">
                {number(kr.current_value)} {kr.unit} · from {number(kr.start_value)} to {number(kr.target_value)} {kr.unit}
              </p>
              <div className="mt-3">
                <ProgressBar value={progress(kr)} label={`${kr.title} progress`} />
              </div>
              <ActionForm action={checkInAction} submitLabel="Check in" hidden={{ org: ctx.slug, keyResultId: kr.id }} variant="secondary" className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end" resetOnSuccess>
                <Field label="New value">
                  <Input name="value" type="number" step="any" required defaultValue={kr.current_value} />
                </Field>
                <Field label="Note (optional)">
                  <Input name="note" maxLength={1000} placeholder="What changed?" />
                </Field>
              </ActionForm>
            </Card>
          ))}
        </section>

        <section>
          <h3 className="mb-3 font-semibold">Recent check-ins</h3>
          {checkIns.length === 0 ? (
            <p className="text-sm text-zinc-500">No check-ins yet.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {checkIns.map((c) => {
                const kr = objective.key_results.find((k) => k.id === c.key_result_id);
                return (
                  <li key={c.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="font-medium">{c.user_name ?? "Former member"}</span> set{" "}
                    <span className="font-medium">{kr?.title}</span> to <span className="tabular-nums">{number(c.value)}</span>
                    {c.note && <span className="text-zinc-600 dark:text-zinc-400">: {c.note}</span>}
                    <time className="block text-xs text-zinc-500" dateTime={c.created_at.toISOString()}>
                      {c.created_at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {canEdit && (
        <aside className="space-y-6">
          <Card>
            <h3 className="mb-3 font-semibold">Status</h3>
            <ActionForm action={setStatusAction} submitLabel="Update status" hidden={hidden} variant="secondary">
              <Select name="status" defaultValue={objective.status} aria-label="Status">
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </ActionForm>
          </Card>
          <Card>
            <h3 className="mb-3 font-semibold">Add a key result</h3>
            <ActionForm action={addKeyResultAction} submitLabel="Add key result" hidden={hidden} resetOnSuccess>
              <Field label="Key result">
                <Input name="title" required maxLength={200} placeholder="Activation rate" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Start">
                  <Input name="startValue" type="number" step="any" required defaultValue={0} />
                </Field>
                <Field label="Target">
                  <Input name="targetValue" type="number" step="any" required />
                </Field>
                <Field label="Unit">
                  <Input name="unit" maxLength={20} placeholder="%" />
                </Field>
              </div>
            </ActionForm>
          </Card>
          <form action={deleteObjectiveAction}>
            <input type="hidden" name="org" value={ctx.slug} />
            <input type="hidden" name="objectiveId" value={objective.id} />
            <button className={buttonClass("danger")}>Delete objective</button>
          </form>
        </aside>
      )}
    </div>
  );
}
