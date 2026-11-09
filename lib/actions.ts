import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "./auth/current";
import { getDb } from "./db";
import { UserError } from "./services/errors";
import { resolveOrg, type OrgContext } from "./services/orgs";

export type ActionState = { error?: string; message?: string; link?: string } | undefined;

/**
 * Turn expected failures (UserError) into form state. Anything else is rethrown so
 * Next.js shows a generic error page without leaking details. redirect() and
 * notFound() also work by throwing, so they pass through untouched.
 */
export async function guard(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { message: "Saved." };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}

/** Every org-scoped action re-checks the session and membership; nothing from the client is trusted. */
export async function orgFromForm(form: FormData): Promise<OrgContext> {
  const user = await requireUser();
  const slug = form.get("org");
  if (typeof slug !== "string") notFound();
  const ctx = await resolveOrg(getDb(), user.id, slug);
  if (!ctx) notFound();
  return ctx;
}

export async function orgFromSlug(slug: string): Promise<OrgContext> {
  const user = await requireUser();
  const ctx = await resolveOrg(getDb(), user.id, slug);
  if (!ctx) notFound();
  return ctx;
}
