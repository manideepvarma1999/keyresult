import { randomUUID } from "node:crypto";
import { withContext, type Sql, type Tx } from "../db";
import type { Plan, Role } from "../permissions";
import { audit } from "./audit";
import { UserError } from "./errors";

export interface OrgContext {
  userId: string;
  orgId: string;
  orgName: string;
  slug: string;
  role: Role;
  plan: Plan;
  stripeCustomerId: string | null;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export async function createOrganization(db: Sql, userId: string, input: { name: string; slug: string }): Promise<OrgSummary> {
  const orgId = randomUUID();
  try {
    return await withContext(db, { userId, orgId }, async (tx) => {
      await tx`insert into organizations (id, name, slug) values (${orgId}, ${input.name}, ${input.slug})`;
      await tx`insert into memberships (org_id, user_id, role) values (${orgId}, ${userId}, 'owner')`;
      await audit(tx, { orgId, actorId: userId, action: "org.created", target: input.slug });
      return { id: orgId, name: input.name, slug: input.slug, role: "owner" as Role };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new UserError("That URL is already taken.");
    throw error;
  }
}

export async function listMyOrganizations(db: Sql, userId: string): Promise<OrgSummary[]> {
  return withContext(db, { userId }, (tx) =>
    tx<OrgSummary[]>`
      select o.id, o.name, o.slug, m.role
      from memberships m join organizations o on o.id = m.org_id
      where m.user_id = ${userId}
      order by o.name`,
  );
}

/** Resolve an org by slug for this user. Null when it doesn't exist or they aren't a member. */
export async function resolveOrg(db: Sql, userId: string, slug: string): Promise<OrgContext | null> {
  const rows = await withContext(db, { userId }, (tx) =>
    tx<{ id: string; name: string; slug: string; plan: Plan; stripe_customer_id: string | null; role: Role }[]>`
      select o.id, o.name, o.slug, o.plan, o.stripe_customer_id, m.role
      from organizations o join memberships m on m.org_id = o.id and m.user_id = ${userId}
      where o.slug = ${slug}`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId,
    orgId: row.id,
    orgName: row.name,
    slug: row.slug,
    role: row.role,
    plan: row.plan,
    stripeCustomerId: row.stripe_customer_id,
  };
}

/** Run a query in this org's RLS scope. */
export function inOrg<T>(db: Sql, ctx: OrgContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withContext(db, { userId: ctx.userId, orgId: ctx.orgId }, fn);
}
