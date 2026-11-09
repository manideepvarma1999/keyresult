/**
 * npm run db:migrate
 *   DATABASE_OWNER_URL  owner / migration connection
 *   DATABASE_URL        connection string the app uses at runtime
 */
import { runMigrations } from "./migrate-lib";

const ownerUrl = process.env.DATABASE_OWNER_URL;
const appUrl = process.env.DATABASE_URL;
if (!ownerUrl || !appUrl) {
  console.error("DATABASE_OWNER_URL and DATABASE_URL must be set (see .env.example).");
  process.exit(1);
}

runMigrations(ownerUrl, appUrl, console.log).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
