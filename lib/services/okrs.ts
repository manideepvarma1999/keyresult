import type { Sql } from "../db";
import { hasRole, PLAN_LIMITS } from "../permissions";
import type { Status } from "../okr";
import { audit } from "./audit";
import { ForbiddenError, NotFoundError, UserError } from "./errors";
import { inOrg, type OrgContext } from "./orgs";

export interface KeyResult {
  id: string;
  objective_id: string;
  title: string;
  start_value: string;
  target_value: string;
  current_value: string;
  unit: string;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  quarter: string;
  status: Status;
  owner_id: string | null;
  owner_name: string | null;
  updated_at: Date;
  key_results: KeyResult[];
}

export interface CheckIn {
  id: string;
  key_result_id: string;
  value: string;
  note: string;
  created_at: Date;
  user_name: string | null;
}

export async function listObjectives(db: Sql, ctx: OrgContext, quarter: string): Promise<Objective[]> {
  return inOrg(db, ctx, async (tx) => {
    // No org_id filter needed: row-level security limits these to the current org.
    const objectives = await tx<Omit<Objective, "key_results">[]>`
      select o.id, o.title, o.description, o.quarter, o.status, o.owner_id, o.updated_at, u.name as owner_name
      from objectives o left join users u on u.id = o.owner_id
      where o.quarter = ${quarter}
      order by o.created_at`;
    if (objectives.length === 0) return [];
    const krs = await tx<KeyResult[]>`
      select id, objective_id, title, start_value::text, target_value::text, current_value::text, unit
      from key_results where objective_id in ${tx(objectives.map((o) => o.id))}
      order by created_at`;
    return objectives.map((o) => ({ ...o, key_results: krs.filter((k) => k.objective_id === o.id) }));
  });
}

export async function getObjective(db: Sql, ctx: OrgContext, id: string): Promise<{ objective: Objective; checkIns: CheckIn[] }> {
  return inOrg(db, ctx, async (tx) => {
    const [objective] = await tx<Omit<Objective, "key_results">[]>`
      select o.id, o.title, o.description, o.quarter, o.status, o.owner_id, o.updated_at, u.name as owner_name
      from objectives o left join users u on u.id = o.owner_id
      where o.id = ${id}`;
    if (!objective) throw new NotFoundError("Objective not found.");
    const krs = await tx<KeyResult[]>`
      select id, objective_id, title, start_value::text, target_value::text, current_value::text, unit
      from key_results where objective_id = ${id} order by created_at`;
    const checkIns = await tx<CheckIn[]>`
      select c.id, c.key_result_id, c.value::text, c.note, c.created_at, u.name as user_name
      from check_ins c join key_results k on k.id = c.key_result_id left join users u on u.id = c.user_id
      where k.objective_id = ${id}
      order by c.created_at desc limit 50`;
    return { objective: { ...objective, key_results: krs }, checkIns };
  });
}

export async function createObjective(
  db: Sql,
  ctx: OrgContext,
  input: { title: string; description: string; quarter: string },
): Promise<string> {
  return inOrg(db, ctx, async (tx) => {
    const limit = PLAN_LIMITS[ctx.plan].objectivesPerQuarter;
    if (Number.isFinite(limit)) {
      const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from objectives where quarter = ${input.quarter}`;
      if (count >= limit) throw new UserError(`The free plan allows ${limit} objectives per quarter. Upgrade to add more.`);
    }
    const [row] = await tx<{ id: string }[]>`
      insert into objectives (org_id, title, description, quarter, owner_id)
      values (${ctx.orgId}, ${input.title}, ${input.description}, ${input.quarter}, ${ctx.userId})
      returning id`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "objective.created", target: input.title });
    return row.id;
  });
}

/** Members may edit objectives they own; admins and owners may edit any. */
async function assertCanEdit(db: Sql, ctx: OrgContext, objectiveId: string): Promise<{ title: string }> {
  const [row] = await inOrg(db, ctx, (tx) => tx<{ owner_id: string | null; title: string }[]>`
    select owner_id, title from objectives where id = ${objectiveId}`);
  if (!row) throw new NotFoundError("Objective not found.");
  if (row.owner_id !== ctx.userId && !hasRole(ctx.role, "admin")) throw new ForbiddenError();
  return row;
}

export async function setObjectiveStatus(db: Sql, ctx: OrgContext, objectiveId: string, status: Status): Promise<void> {
  const { title } = await assertCanEdit(db, ctx, objectiveId);
  await inOrg(db, ctx, async (tx) => {
    await tx`update objectives set status = ${status}, updated_at = now() where id = ${objectiveId}`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "objective.status_changed", target: title, metadata: { status } });
  });
}

export async function deleteObjective(db: Sql, ctx: OrgContext, objectiveId: string): Promise<void> {
  const { title } = await assertCanEdit(db, ctx, objectiveId);
  await inOrg(db, ctx, async (tx) => {
    await tx`delete from objectives where id = ${objectiveId}`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "objective.deleted", target: title });
  });
}

export async function addKeyResult(
  db: Sql,
  ctx: OrgContext,
  input: { objectiveId: string; title: string; startValue: number; targetValue: number; unit: string },
): Promise<void> {
  await assertCanEdit(db, ctx, input.objectiveId);
  await inOrg(db, ctx, async (tx) => {
    await tx`
      insert into key_results (org_id, objective_id, title, start_value, target_value, current_value, unit)
      values (${ctx.orgId}, ${input.objectiveId}, ${input.title}, ${input.startValue}, ${input.targetValue}, ${input.startValue}, ${input.unit})`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "key_result.created", target: input.title });
  });
}

/** Any member can record progress on any key result in their org. */
export async function checkIn(db: Sql, ctx: OrgContext, input: { keyResultId: string; value: number; note: string }): Promise<string> {
  return inOrg(db, ctx, async (tx) => {
    const [kr] = await tx<{ objective_id: string; title: string }[]>`
      update key_results set current_value = ${input.value} where id = ${input.keyResultId}
      returning objective_id, title`;
    if (!kr) throw new NotFoundError("Key result not found.");
    await tx`
      insert into check_ins (org_id, key_result_id, user_id, value, note)
      values (${ctx.orgId}, ${input.keyResultId}, ${ctx.userId}, ${input.value}, ${input.note})`;
    await tx`update objectives set updated_at = now() where id = ${kr.objective_id}`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "key_result.checked_in", target: kr.title, metadata: { value: input.value } });
    return kr.objective_id;
  });
}

export async function deleteKeyResult(db: Sql, ctx: OrgContext, keyResultId: string): Promise<string> {
  const [kr] = await inOrg(db, ctx, (tx) => tx<{ objective_id: string; title: string }[]>`
    select objective_id, title from key_results where id = ${keyResultId}`);
  if (!kr) throw new NotFoundError("Key result not found.");
  await assertCanEdit(db, ctx, kr.objective_id);
  await inOrg(db, ctx, async (tx) => {
    await tx`delete from key_results where id = ${keyResultId}`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "key_result.deleted", target: kr.title });
  });
  return kr.objective_id;
}
