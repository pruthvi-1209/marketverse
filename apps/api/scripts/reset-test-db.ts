import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDatabase, db, pool } from "../src/database/client";
import { env } from "../src/config/env";
import { logger } from "../src/core/logger/logger";

/**
 * Recreates the schema of a dedicated TEST database only. This is deliberately
 * strict: the script refuses to run against a database whose name does not
 * contain "test", so a development or production volume cannot be wiped by
 * accident.
 */
async function resetTestDatabase(): Promise<void> {
  if (env.isProduction) {
    throw new Error("Refusing to reset a database in production");
  }

  const databaseName = new URL(env.DATABASE_URL).pathname.replace(/^\//, "");
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to reset database '${databaseName}'. The database name must contain 'test'.`,
    );
  }

  logger.warn({ databaseName }, "Resetting test database schema");
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");

  const migrationsFolder = path.join(__dirname, "../src/database/migrations");
  await migrate(db, { migrationsFolder });
  logger.info({ databaseName, migrationsFolder }, "Test database reset and migrated");
}

resetTestDatabase()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, "Test database reset failed");
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
