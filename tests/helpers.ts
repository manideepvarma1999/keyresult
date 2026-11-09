import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { inject } from "vitest";
import { signUp } from "@/lib/services/accounts";
import { createOrganization, resolveOrg, type OrgContext } from "@/lib/services/orgs";

export function connect() {
  return postgres(inject("databaseUrl"), { max: 4, onnotice: () => {} });
}

export function connectOwner() {
  return postgres(inject("ownerUrl"), { max: 1, onnotice: () => {} });
}

export async function makeUser(db: postgres.Sql, name = "Test User") {
  const email = `${randomUUID()}@example.test`;
  const id = await signUp(db, { name, email, password: "correct horse battery" });
  return { id, email, name };
}

export async function makeOrg(db: postgres.Sql, userId: string): Promise<OrgContext> {
  const slug = `org-${randomUUID().slice(0, 8)}`;
  await createOrganization(db, userId, { name: slug, slug });
  return (await resolveOrg(db, userId, slug))!;
}
