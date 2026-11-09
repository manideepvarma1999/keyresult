import type { Sql } from "../db";
import { generateToken, hashToken } from "./tokens";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY;
const RENEW_WHEN_LESS_THAN_MS = 15 * DAY;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface ValidSession {
  user: SessionUser;
  expiresAt: Date;
  renewed: boolean;
}

export async function createSession(db: Sql, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db`insert into sessions (id, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expiresAt})`;
  return { token, expiresAt };
}

/** Returns the session's user, extending the session when it's past its halfway point. */
export async function validateSession(db: Sql, token: string): Promise<ValidSession | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = hashToken(token);
  const rows = await db<{ expires_at: Date; user_id: string; email: string; name: string }[]>`
    select s.expires_at, u.id as user_id, u.email, u.name
    from sessions s join users u on u.id = s.user_id
    where s.id = ${id}`;
  const row = rows[0];
  if (!row) return null;

  if (row.expires_at.getTime() <= Date.now()) {
    await db`delete from sessions where id = ${id}`;
    return null;
  }

  let expiresAt = row.expires_at;
  let renewed = false;
  if (expiresAt.getTime() - Date.now() < RENEW_WHEN_LESS_THAN_MS) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db`update sessions set expires_at = ${expiresAt} where id = ${id}`;
    renewed = true;
  }
  return { user: { id: row.user_id, email: row.email, name: row.name }, expiresAt, renewed };
}

export async function deleteSession(db: Sql, token: string): Promise<void> {
  await db`delete from sessions where id = ${hashToken(token)}`;
}

export async function deleteAllSessions(db: Sql, userId: string): Promise<void> {
  await db`delete from sessions where user_id = ${userId}`;
}
