/**
 * Gives the integration tests a fresh, migrated database.
 * CI provides TEST_DATABASE_OWNER_URL (a Postgres service container); locally an
 * embedded Postgres is started in a temp directory, so no Docker or setup is needed.
 */
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../scripts/migrate-lib";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    ownerUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const secret = () => randomBytes(18).toString("base64url");
  let ownerUrl = process.env.TEST_DATABASE_OWNER_URL;
  let teardown = async () => {};

  if (!ownerUrl) {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const dir = await mkdtemp(path.join(tmpdir(), "keyresult-test-"));
    const password = secret();
    const port = 55000 + Math.floor(Math.random() * 1000);
    const pg = new EmbeddedPostgres({ databaseDir: dir, user: "owner", password, port, persistent: false, onLog: () => {} });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("keyresult_test");
    ownerUrl = `postgres://owner:${password}@localhost:${port}/keyresult_test`;
    teardown = async () => {
      await pg.stop();
      await rm(dir, { recursive: true, force: true });
    };
  }

  const appUrl = new URL(ownerUrl);
  appUrl.username = "keyresult_app_test";
  appUrl.password = secret();
  await runMigrations(ownerUrl, appUrl.toString());

  project.provide("databaseUrl", appUrl.toString());
  project.provide("ownerUrl", ownerUrl);
  return teardown;
}
