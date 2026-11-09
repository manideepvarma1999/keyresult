import "server-only";
import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

declare global {
  // One pool per process, reused across hot reloads in development.
  var __keyresultSql: Sql | undefined;
}

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 10, idle_timeout: 20, onnotice: () => {} });
}

/** The shared connection pool, created on first use. */
export function getDb(): Sql {
  globalThis.__keyresultSql ??= createClient();
  return globalThis.__keyresultSql;
}

/**
 * Run `fn` in a transaction scoped to one user and (optionally) one organization.
 * Row-level security policies read these settings, so queries inside can only
 * touch that organization's rows even if a WHERE clause is forgotten.
 */
export async function withContext<T>(
  db: Sql,
  ctx: { userId?: string | null; orgId?: string | null },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${ctx.userId ?? ""}, true),
                    set_config('app.org_id', ${ctx.orgId ?? ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
