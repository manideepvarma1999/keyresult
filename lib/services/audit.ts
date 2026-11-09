import type { Tx } from "../db";

export async function audit(
  tx: Tx,
  entry: { orgId: string; actorId: string | null; action: string; target?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await tx`
    insert into audit_log (org_id, actor_id, action, target, metadata)
    values (${entry.orgId}, ${entry.actorId}, ${entry.action}, ${entry.target ?? ""}, ${tx.json((entry.metadata ?? {}) as never)})`;
}

export interface AuditEntry {
  id: string;
  action: string;
  target: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  actor_name: string | null;
}

export async function listAudit(tx: Tx, limit = 100): Promise<AuditEntry[]> {
  return tx<AuditEntry[]>`
    select a.id::text, a.action, a.target, a.metadata, a.created_at, u.name as actor_name
    from audit_log a left join users u on u.id = a.actor_id
    order by a.created_at desc, a.id desc
    limit ${limit}`;
}
