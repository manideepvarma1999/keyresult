/**
 * npm run db:dev
 * Runs a real Postgres from npm (no Docker needed) on the port in DATABASE_OWNER_URL,
 * storing data in ./.pgdata. Stop it with Ctrl+C. docker-compose.yml is the alternative.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import postgres from "postgres";

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) {
  console.error("DATABASE_OWNER_URL must be set (see .env.example).");
  process.exit(1);
}
const url = new URL(ownerUrl);
const database = url.pathname.slice(1);

const pg = new EmbeddedPostgres({
  databaseDir: ".pgdata",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  onLog: () => {},
});

async function main() {
  const fresh = !existsSync(".pgdata");
  if (fresh) await pg.initialise();
  await pg.start();
  const admin = postgres({ host: "localhost", port: Number(url.port || 5432), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: "postgres", max: 1 });
  const [{ exists }] = await admin<{ exists: boolean }[]>`select exists (select 1 from pg_database where datname = ${database})`;
  if (!exists) await admin.unsafe(`create database "${database.replace(/"/g, "")}"`);
  await admin.end();
  console.log(`Postgres running on localhost:${url.port}, database "${database}". Ctrl+C to stop.`);
}

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

main().catch(async (error) => {
  console.error(error);
  await pg.stop().catch(() => {});
  process.exit(1);
});
