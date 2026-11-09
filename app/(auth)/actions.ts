"use server";

import { redirect } from "next/navigation";
import { guard, type ActionState } from "@/lib/actions";
import { clientIp, endSession, requireUser, safeNext, startSession } from "@/lib/auth/current";
import { deleteAllSessions } from "@/lib/auth/sessions";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { logIn, signUp } from "@/lib/services/accounts";
import { UserError } from "@/lib/services/errors";
import { firstError, formObject, loginSchema, signupSchema } from "@/lib/validation";

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

export async function signupAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await guard(async () => {
    const parsed = signupSchema.safeParse(formObject(form));
    if (!parsed.success) throw new UserError(firstError(parsed.error));
    const db = getDb();
    if (!(await rateLimit(db, `signup:${await clientIp()}`, 10, 3600))) throw new UserError(TOO_MANY);
    const userId = await signUp(db, parsed.data);
    await startSession(userId);
  });
  if (result?.error) return result;
  redirect(safeNext(form.get("next")));
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await guard(async () => {
    const parsed = loginSchema.safeParse(formObject(form));
    if (!parsed.success) throw new UserError("Enter your email and password.");
    const db = getDb();
    const ip = await clientIp();
    // Per-IP and per-account limits slow both spraying and targeted guessing.
    const allowed =
      (await rateLimit(db, `login:ip:${ip}`, 30, 900)) && (await rateLimit(db, `login:email:${parsed.data.email}`, 10, 900));
    if (!allowed) throw new UserError(TOO_MANY);
    const userId = await logIn(db, parsed.data);
    if (!userId) throw new UserError("Incorrect email or password.");
    await startSession(userId);
  });
  if (result?.error) return result;
  redirect(safeNext(form.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function logoutEverywhereAction(): Promise<void> {
  const user = await requireUser();
  await deleteAllSessions(getDb(), user.id);
  await endSession();
  redirect("/login");
}
