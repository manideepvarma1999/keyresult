import { afterAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/auth/tokens";
import { createSession, deleteAllSessions, deleteSession, validateSession } from "@/lib/auth/sessions";
import { logIn, signUp } from "@/lib/services/accounts";
import { rateLimit } from "@/lib/rate-limit";
import { connect, makeUser } from "./helpers";

const db = connect();
afterAll(() => db.end());

describe("accounts", () => {
  it("stores an argon2id hash, never the password", async () => {
    const user = await makeUser(db);
    const [row] = await db<{ password_hash: string }[]>`select password_hash from users where id = ${user.id}`;
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain("correct horse");
  });

  it("logs in with the right password only", async () => {
    const user = await makeUser(db);
    expect(await logIn(db, { email: user.email, password: "correct horse battery" })).toBe(user.id);
    expect(await logIn(db, { email: user.email, password: "wrong password!" })).toBeNull();
    expect(await logIn(db, { email: "nobody@example.test", password: "whatever123" })).toBeNull();
  });

  it("gives a vague error for an email that's already registered", async () => {
    const user = await makeUser(db);
    await expect(signUp(db, { name: "x", email: user.email, password: "another password" })).rejects.toThrow(/log in instead/);
  });
});

describe("sessions", () => {
  it("stores only the token hash and validates the raw token", async () => {
    const user = await makeUser(db);
    const { token } = await createSession(db, user.id);
    const rows = await db`select id from sessions where user_id = ${user.id}`;
    expect(rows[0].id).toBe(hashToken(token));
    expect(rows[0].id).not.toBe(token);
    expect((await validateSession(db, token))?.user.id).toBe(user.id);
  });

  it("rejects malformed, unknown, expired and deleted tokens", async () => {
    const user = await makeUser(db);
    expect(await validateSession(db, "not-a-token")).toBeNull();
    expect(await validateSession(db, "a".repeat(43))).toBeNull();

    const { token } = await createSession(db, user.id);
    await db`update sessions set expires_at = now() - interval '1 minute' where id = ${hashToken(token)}`;
    expect(await validateSession(db, token)).toBeNull();
    expect(await db`select 1 from sessions where id = ${hashToken(token)}`).toHaveLength(0);

    const second = await createSession(db, user.id);
    await deleteSession(db, second.token);
    expect(await validateSession(db, second.token)).toBeNull();
  });

  it("extends sessions past their halfway point and can sign out everywhere", async () => {
    const user = await makeUser(db);
    const { token } = await createSession(db, user.id);
    await db`update sessions set expires_at = now() + interval '2 days' where id = ${hashToken(token)}`;
    const result = await validateSession(db, token);
    expect(result?.renewed).toBe(true);
    expect(result!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);

    await createSession(db, user.id);
    await deleteAllSessions(db, user.id);
    expect(await db`select 1 from sessions where user_id = ${user.id}`).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit per window", async () => {
    const key = `test:${Math.random()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(db, key, 3, 60));
    expect(results).toEqual([true, true, true, false]);
    await db`update rate_limits set window_start = now() - interval '2 minutes' where key = ${key}`;
    expect(await rateLimit(db, key, 3, 60)).toBe(true);
  });
});
