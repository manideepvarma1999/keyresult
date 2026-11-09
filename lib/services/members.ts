import { withContext, type Sql } from "../db";
import { generateToken, hashToken } from "../auth/tokens";
import { assignableRoles, canManageMember, hasRole, PLAN_LIMITS, type Role } from "../permissions";
import { audit } from "./audit";
import { ForbiddenError, NotFoundError, UserError } from "./errors";
import { inOrg, type OrgContext } from "./orgs";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  created_at: Date;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  expires_at: Date;
}

export async function listMembers(db: Sql, ctx: OrgContext): Promise<{ members: Member[]; invites: PendingInvite[] }> {
  return inOrg(db, ctx, async (tx) => {
    const members = await tx<Member[]>`
      select m.user_id, u.name, u.email, m.role, m.created_at
      from memberships m join users u on u.id = m.user_id
      where m.org_id = ${ctx.orgId}
      order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.name`;
    const invites = await tx<PendingInvite[]>`
      select id, email, role, expires_at from invitations
      where accepted_at is null and expires_at > now()
      order by created_at desc`;
    return { members, invites };
  });
}

/** Creates an invitation and returns the one-time token. Only its hash is stored. */
export async function createInvite(db: Sql, ctx: OrgContext, input: { email: string; role: "admin" | "member" }): Promise<string> {
  if (!hasRole(ctx.role, "admin")) throw new ForbiddenError();
  if (!assignableRoles(ctx.role).includes(input.role)) throw new ForbiddenError("Only owners can invite admins.");

  return inOrg(db, ctx, async (tx) => {
    const [{ members, invites, already }] = await tx<{ members: number; invites: number; already: boolean }[]>`
      select
        (select count(*)::int from memberships where org_id = ${ctx.orgId}) as members,
        (select count(*)::int from invitations where accepted_at is null and expires_at > now()) as invites,
        exists (select 1 from memberships m join users u on u.id = m.user_id
                where m.org_id = ${ctx.orgId} and u.email = ${input.email}) as already`;
    if (already) throw new UserError("That person is already a member.");
    const limit = PLAN_LIMITS[ctx.plan].members;
    if (members + invites >= limit) throw new UserError(`The free plan allows ${limit} members. Upgrade to invite more.`);

    const token = generateToken();
    await tx`
      insert into invitations (org_id, email, role, token_hash, invited_by, expires_at)
      values (${ctx.orgId}, ${input.email}, ${input.role}, ${hashToken(token)}, ${ctx.userId}, ${new Date(Date.now() + INVITE_TTL_MS)})`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "member.invited", target: input.email, metadata: { role: input.role } });
    return token;
  });
}

export async function revokeInvite(db: Sql, ctx: OrgContext, inviteId: string): Promise<void> {
  if (!hasRole(ctx.role, "admin")) throw new ForbiddenError();
  await inOrg(db, ctx, async (tx) => {
    const [row] = await tx<{ email: string }[]>`delete from invitations where id = ${inviteId} and accepted_at is null returning email`;
    if (!row) throw new NotFoundError("Invitation not found.");
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "member.invite_revoked", target: row.email });
  });
}

export interface InvitePreview {
  orgName: string;
  email: string;
  valid: boolean;
}

export async function previewInvite(db: Sql, token: string): Promise<InvitePreview | null> {
  const [row] = await db<{ org_name: string; email: string; expires_at: Date; accepted_at: Date | null }[]>`
    select org_name, email, expires_at, accepted_at from invitation_by_token_hash(${hashToken(token)})`;
  if (!row) return null;
  return { orgName: row.org_name, email: row.email, valid: !row.accepted_at && row.expires_at > new Date() };
}

/** Accept an invitation. The signed-in user's email must match the invited address. */
export async function acceptInvite(db: Sql, user: { id: string; email: string }, token: string): Promise<string> {
  const [invite] = await db<{ id: string; org_id: string; email: string; role: Role; expires_at: Date; accepted_at: Date | null }[]>`
    select id, org_id, email, role, expires_at, accepted_at from invitation_by_token_hash(${hashToken(token)})`;
  if (!invite || invite.accepted_at || invite.expires_at <= new Date()) {
    throw new UserError("This invitation is invalid or has expired.");
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new UserError(`This invitation was sent to ${invite.email}. Log in with that account to accept it.`);
  }

  return withContext(db, { userId: user.id, orgId: invite.org_id }, async (tx) => {
    // Mark used first; the accepted_at guard makes acceptance single-use even under concurrency.
    const used = await tx`update invitations set accepted_at = now() where id = ${invite.id} and accepted_at is null returning id`;
    if (used.length === 0) throw new UserError("This invitation has already been used.");
    await tx`
      insert into memberships (org_id, user_id, role) values (${invite.org_id}, ${user.id}, ${invite.role})
      on conflict (org_id, user_id) do nothing`;
    await audit(tx, { orgId: invite.org_id, actorId: user.id, action: "member.joined", target: user.email, metadata: { role: invite.role } });
    const [org] = await tx<{ slug: string }[]>`select slug from organizations where id = ${invite.org_id}`;
    return org.slug;
  });
}

async function targetRole(db: Sql, ctx: OrgContext, userId: string): Promise<{ role: Role; email: string }> {
  const [row] = await inOrg(db, ctx, (tx) => tx<{ role: Role; email: string }[]>`
    select m.role, u.email from memberships m join users u on u.id = m.user_id
    where m.org_id = ${ctx.orgId} and m.user_id = ${userId}`);
  if (!row) throw new NotFoundError("Member not found.");
  return row;
}

async function assertNotLastOwner(db: Sql, ctx: OrgContext): Promise<void> {
  const [{ owners }] = await inOrg(db, ctx, (tx) => tx<{ owners: number }[]>`
    select count(*)::int as owners from memberships where org_id = ${ctx.orgId} and role = 'owner'`);
  if (owners <= 1) throw new UserError("An organization needs at least one owner.");
}

export async function changeRole(db: Sql, ctx: OrgContext, userId: string, role: Role): Promise<void> {
  const target = await targetRole(db, ctx, userId);
  if (!canManageMember(ctx.role, target.role) || !assignableRoles(ctx.role).includes(role)) throw new ForbiddenError();
  if (target.role === "owner" && role !== "owner") await assertNotLastOwner(db, ctx);
  await inOrg(db, ctx, async (tx) => {
    await tx`update memberships set role = ${role} where org_id = ${ctx.orgId} and user_id = ${userId}`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: "member.role_changed", target: target.email, metadata: { from: target.role, to: role } });
  });
}

/** Remove a member, or leave the organization when userId is yourself. */
export async function removeMember(db: Sql, ctx: OrgContext, userId: string): Promise<void> {
  const target = await targetRole(db, ctx, userId);
  const leaving = userId === ctx.userId;
  if (!leaving && !canManageMember(ctx.role, target.role)) throw new ForbiddenError();
  if (target.role === "owner") await assertNotLastOwner(db, ctx);
  await inOrg(db, ctx, async (tx) => {
    await tx`delete from memberships where org_id = ${ctx.orgId} and user_id = ${userId}`;
    await audit(tx, { orgId: ctx.orgId, actorId: ctx.userId, action: leaving ? "member.left" : "member.removed", target: target.email });
  });
}
