import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withContext, type Tx } from "@/lib/db";
import { createObjective, listObjectives, getObjective, addKeyResult } from "@/lib/services/okrs";
import { listMyOrganizations, resolveOrg, type OrgContext } from "@/lib/services/orgs";
import { connect, makeOrg, makeUser } from "./helpers";

const db = connect();
let alice: { id: string }, bob: { id: string };
let orgA: OrgContext, orgB: OrgContext;
let objectiveA: string;

beforeAll(async () => {
  alice = await makeUser(db, "Alice");
  bob = await makeUser(db, "Bob");
  orgA = await makeOrg(db, alice.id);
  orgB = await makeOrg(db, bob.id);
  objectiveA = await createObjective(db, orgA, { title: "Secret plan", description: "", quarter: "2026-Q4" });
  await addKeyResult(db, orgA, { objectiveId: objectiveA, title: "KR", startValue: 0, targetValue: 10, unit: "" });
});

afterAll(() => db.end());

describe("row-level security", () => {
  it("hides other tenants' rows even from queries with no WHERE clause", async () => {
    const asB = (q: (tx: Tx) => PromiseLike<readonly unknown[]>) =>
      withContext(db, { userId: bob.id, orgId: orgB.orgId }, async (tx) => q(tx));
    expect(await asB((tx) => tx`select * from objectives`)).toHaveLength(0);
    expect(await asB((tx) => tx`select * from key_results`)).toHaveLength(0);
    expect(await asB((tx) => tx`select * from audit_log where org_id = ${orgA.orgId}`)).toHaveLength(0);
  });

  it("returns nothing at all without a tenant context", async () => {
    const rows = await withContext(db, {}, (tx) => tx`select * from objectives`);
    expect(rows).toHaveLength(0);
  });

  it("can't read, update or delete another org's objective by id", async () => {
    await expect(getObjective(db, orgB, objectiveA)).rejects.toThrow("not found");
    const updated = await withContext(db, { userId: bob.id, orgId: orgB.orgId }, (tx) =>
      tx`update objectives set title = 'pwned' where id = ${objectiveA} returning id`);
    const deleted = await withContext(db, { userId: bob.id, orgId: orgB.orgId }, (tx) =>
      tx`delete from objectives where id = ${objectiveA} returning id`);
    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    const [still] = await listObjectives(db, orgA, "2026-Q4");
    expect(still.title).toBe("Secret plan");
  });

  it("rejects writes that target another org", async () => {
    await expect(
      withContext(db, { userId: bob.id, orgId: orgB.orgId }, (tx) =>
        tx`insert into objectives (org_id, title, quarter) values (${orgA.orgId}, 'x', '2026-Q4')`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("can't attach a key result to another org's objective", async () => {
    await expect(
      withContext(db, { userId: bob.id, orgId: orgB.orgId }, (tx) =>
        tx`insert into key_results (org_id, objective_id, title, start_value, target_value, current_value)
           values (${orgB.orgId}, ${objectiveA}, 'x', 0, 1, 0)`),
    ).rejects.toMatchObject({ code: "23503" }); // composite foreign key violation
  });

  it("doesn't let the app role switch RLS off or rewrite the audit log", async () => {
    await expect(
      withContext(db, { userId: bob.id, orgId: orgB.orgId }, async (tx) => {
        await tx`set local row_security = off`;
        return tx`select * from objectives`;
      }),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withContext(db, { userId: alice.id, orgId: orgA.orgId }, (tx) => tx`delete from audit_log`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(db`alter table objectives disable row level security`).rejects.toMatchObject({ code: "42501" });
  });

  it("only resolves orgs the user belongs to", async () => {
    expect(await resolveOrg(db, bob.id, orgA.slug)).toBeNull();
    expect((await listMyOrganizations(db, bob.id)).map((o) => o.slug)).toEqual([orgB.slug]);
  });
});
