import { afterAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/auth/tokens";
import { listAudit } from "@/lib/services/audit";
import { acceptInvite, changeRole, createInvite, listMembers, previewInvite, removeMember } from "@/lib/services/members";
import { addKeyResult, checkIn, createObjective, deleteObjective, getObjective, setObjectiveStatus } from "@/lib/services/okrs";
import { inOrg, resolveOrg, type OrgContext } from "@/lib/services/orgs";
import { connect, connectOwner, makeOrg, makeUser } from "./helpers";

const db = connect();
afterAll(() => db.end());

async function join(org: OrgContext, role: "admin" | "member") {
  const user = await makeUser(db);
  const token = await createInvite(db, org, { email: user.email, role });
  await acceptInvite(db, user, token);
  return { user, ctx: (await resolveOrg(db, user.id, org.slug))! };
}

describe("invitations", () => {
  it("is single-use and bound to the invited email", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    const invitee = await makeUser(db);
    const stranger = await makeUser(db);
    const token = await createInvite(db, org, { email: invitee.email, role: "member" });

    expect(await previewInvite(db, token)).toMatchObject({ valid: true, email: invitee.email });
    await expect(acceptInvite(db, stranger, token)).rejects.toThrow(/sent to/);
    expect(await acceptInvite(db, invitee, token)).toBe(org.slug);
    await expect(acceptInvite(db, invitee, token)).rejects.toThrow(/invalid or has expired/);
    expect((await resolveOrg(db, invitee.id, org.slug))?.role).toBe("member");
  });

  it("rejects expired and unknown tokens", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    const invitee = await makeUser(db);
    const token = await createInvite(db, org, { email: invitee.email, role: "member" });
    const admin = connectOwner();
    await admin`update invitations set expires_at = now() - interval '1 hour' where token_hash = ${hashToken(token)}`;
    await admin.end();
    await expect(acceptInvite(db, invitee, token)).rejects.toThrow(/expired/);
    await expect(acceptInvite(db, invitee, "x".repeat(43))).rejects.toThrow(/invalid/);
  });

  it("only lets admins invite, and only owners invite admins", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    const { ctx: member } = await join(org, "member");
    const { ctx: admin } = await join(org, "admin");
    await expect(createInvite(db, member, { email: "a@example.test", role: "member" })).rejects.toThrow(/permission/);
    await expect(createInvite(db, admin, { email: "b@example.test", role: "admin" })).rejects.toThrow(/owners/);
    await expect(createInvite(db, admin, { email: "c@example.test", role: "member" })).resolves.toBeTypeOf("string");
  });

  it("enforces the free plan member limit", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    for (let i = 0; i < 4; i++) await createInvite(db, org, { email: `m${i}-${org.slug}@example.test`, role: "member" });
    await expect(createInvite(db, org, { email: `over-${org.slug}@example.test`, role: "member" })).rejects.toThrow(/free plan/);
  });
});

describe("roles", () => {
  it("never leaves an organization without an owner", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    await expect(changeRole(db, org, owner.id, "admin")).rejects.toThrow(/at least one owner/);
    await expect(removeMember(db, org, owner.id)).rejects.toThrow(/at least one owner/);
  });

  it("stops admins managing other admins or owners", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    const { ctx: admin } = await join(org, "admin");
    const { user: otherAdmin } = await join(org, "admin");
    const { user: member } = await join(org, "member");
    await expect(removeMember(db, admin, otherAdmin.id)).rejects.toThrow(/permission/);
    await expect(changeRole(db, admin, owner.id, "member")).rejects.toThrow(/permission/);
    await expect(changeRole(db, admin, member.id, "admin")).rejects.toThrow(/permission/);
    await removeMember(db, admin, member.id);
    expect((await listMembers(db, org)).members.map((m) => m.user_id)).not.toContain(member.id);
  });
});

describe("objectives", () => {
  it("lets members check in anywhere but only edit their own objectives", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    const { ctx: member } = await join(org, "member");
    const objectiveId = await createObjective(db, org, { title: "Grow", description: "", quarter: "2026-Q4" });
    await addKeyResult(db, org, { objectiveId, title: "Users", startValue: 0, targetValue: 100, unit: "users" });
    const { objective } = await getObjective(db, member, objectiveId);

    await expect(setObjectiveStatus(db, member, objectiveId, "done")).rejects.toThrow(/permission/);
    await expect(deleteObjective(db, member, objectiveId)).rejects.toThrow(/permission/);
    await checkIn(db, member, { keyResultId: objective.key_results[0].id, value: 40, note: "halfway-ish" });

    const after = await getObjective(db, org, objectiveId);
    expect(after.objective.key_results[0].current_value).toBe("40");
    expect(after.checkIns[0]).toMatchObject({ value: "40", note: "halfway-ish" });
  });

  it("enforces the free plan objective limit per quarter", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    for (let i = 0; i < 10; i++) await createObjective(db, org, { title: `O${i}`, description: "", quarter: "2027-Q1" });
    await expect(createObjective(db, org, { title: "one more", description: "", quarter: "2027-Q1" })).rejects.toThrow(/free plan/);
    await expect(createObjective(db, org, { title: "next quarter", description: "", quarter: "2027-Q2" })).resolves.toBeTypeOf("string");
  });

  it("records an audit trail", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    await createObjective(db, org, { title: "Audited", description: "", quarter: "2026-Q4" });
    const actions = (await inOrg(db, org, (tx) => listAudit(tx))).map((e) => e.action);
    expect(actions).toEqual(["objective.created", "org.created"]);
  });
});
