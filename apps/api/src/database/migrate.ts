import path from "node:path";
import { migrate as runMigrations } from "drizzle-orm/node-postgres/migrator";
import { closeDatabase, db, pool } from "./client";
import { logger } from "../core/logger/logger";

async function migrate(): Promise<void> {
  const migrationsFolder = path.join(__dirname, "migrations");
  logger.info({ migrationsFolder }, "Running database migrations");
  await runMigrations(db, { migrationsFolder });
  logger.info("Database migrations completed successfully");

  const { rows } = await pool.query<{ count: string }>(
    "select count(*)::text as count from drizzle.__drizzle_migrations",
  );
  logger.info({ appliedMigrations: rows[0]?.count ?? "0" }, "Migration state");
}

migrate()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, "Database migration failed");
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
