import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db";
import { createSession, deleteSession, SESSION_TTL_MS, validateSession, type SessionUser } from "./sessions";

const secure = process.env.NODE_ENV === "production";
// __Host- cookies must be Secure, path=/ and host-only, which blocks subdomain cookie injection.
export const SESSION_COOKIE = secure ? "__Host-kr_session" : "kr_session";

function cookieOptions(expires: Date) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", expires };
}

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(getDb(), userId);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  store.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSession(getDb(), token);
  if (!session) return null;
  if (session.renewed) {
    try {
      store.set(SESSION_COOKIE, token, cookieOptions(new Date(Date.now() + SESSION_TTL_MS)));
    } catch {
      // Server Components can't set cookies; the next Server Action will.
    }
  }
  return session.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Client IP for rate limiting. Assumes a trusted proxy sets x-forwarded-for (see README). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Only allow same-site relative redirects after login. */
export function safeNext(value: unknown): string {
  return typeof value === "string" && /^\/(?!\/)[\w\-/?=&.%]*$/.test(value) && !value.includes("\\") ? value : "/app";
}
