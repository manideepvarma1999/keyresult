import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * Applies SQL migrations as the schema owner, then makes sure the least-privileged
 * application role exists. The app role's name and password come from the app's
 * connection string, so no credentials live in the repository.
 */
export async function runMigrations(ownerUrl: string, appUrl: string, log: (m: string) => void = () => {}): Promise<void> {
  const app = new URL(appUrl);
  const appRole = decodeURIComponent(app.username);
  const appPassword = decodeURIComponent(app.password);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) throw new Error("The DATABASE_URL user must be a plain lowercase role name.");
  if (appPassword.length < 12) throw new Error("Use a DATABASE_URL password of at least 12 characters.");

  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));

    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }

    // Least-privilege runtime role: no ownership, no BYPASSRLS, no DDL.
    const [{ exists }] = await sql<{ exists: boolean }[]>`select exists (select 1 from pg_roles where rolname = ${appRole})`;
    if (!exists) await sql.unsafe(`create role ${appRole} login nosuperuser nocreatedb nocreaterole nobypassrls`);
    await sql.unsafe(`alter role ${appRole} with login nobypassrls password '${appPassword.replace(/'/g, "''")}'`);
    await sql.unsafe(`
      grant usage on schema public to ${appRole};
      grant select, insert, update, delete on users, sessions, rate_limits, organizations, memberships,
        invitations, objectives, key_results, check_ins to ${appRole};
      grant select, insert on audit_log to ${appRole};
      grant execute on function app_user_id(), app_org_id(), invitation_by_token_hash(text) to ${appRole};
    `);
    log(`role ${appRole} ready`);
  } finally {
    await sql.end();
  }
}
