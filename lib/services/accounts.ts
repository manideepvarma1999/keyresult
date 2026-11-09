import type { Sql } from "../db";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { UserError } from "./errors";

export async function signUp(db: Sql, input: { name: string; email: string; password: string }): Promise<string> {
  const passwordHash = await hashPassword(input.password);
  const rows = await db<{ id: string }[]>`
    insert into users (email, name, password_hash) values (${input.email}, ${input.name}, ${passwordHash})
    on conflict (email) do nothing
    returning id`;
  // Deliberately vague so the form can't be used to check which emails are registered.
  if (!rows[0]) throw new UserError("Couldn't create that account. If you already have one, log in instead.");
  return rows[0].id;
}

/** Returns the user id, or null for any failure (unknown email and wrong password look the same). */
export async function logIn(db: Sql, input: { email: string; password: string }): Promise<string | null> {
  const [user] = await db<{ id: string; password_hash: string }[]>`
    select id, password_hash from users where email = ${input.email}`;
  if (!user) {
    await burnPasswordCheck(input.password);
    return null;
  }
  return (await verifyPassword(user.password_hash, input.password)) ? user.id : null;
}
