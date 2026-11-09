import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { orgFromSlug } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { listAudit } from "@/lib/services/audit";
import { inOrg } from "@/lib/services/orgs";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ params }: PageProps<"/app/[org]/audit">) {
  const { org } = await params;
  const ctx = await orgFromSlug(org);
  if (!hasRole(ctx.role, "admin")) notFound();
  const entries = await inOrg(getDb(), ctx, (tx) => listAudit(tx, 200));

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Audit log</h2>
      <p className="mb-4 text-sm text-zinc-500">The last 200 changes. Entries can be added but never edited or deleted by the app.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2 pr-4 font-medium">When (UTC)</th>
              <th className="py-2 pr-4 font-medium">Who</th>
              <th className="py-2 pr-4 font-medium">Action</th>
              <th className="py-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-zinc-500">
                  {e.created_at.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="py-2 pr-4">{e.actor_name ?? "System"}</td>
                <td className="py-2 pr-4 font-mono text-xs">{e.action}</td>
                <td className="py-2">{e.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
