import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { env } from "../config/env";
import { logger } from "../core/logger/logger";
import * as schema from "./schema";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  application_name: "marketverse-api",
});

pool.on("error", (error) => {
  // Idle client errors must never crash the API process.
  logger.error({ err: error }, "Unexpected PostgreSQL pool error");
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;

export interface DatabaseHealth {
  connected: boolean;
  latencyMs: number | null;
  migrationCount: number | null;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    const latencyMs = Date.now() - startedAt;
    let migrationCount: number | null = null;
    try {
      const result = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      const first = result.rows[0];
      migrationCount = first ? Number.parseInt(first.count, 10) : 0;
    } catch {
      migrationCount = null;
    }
    return { connected: true, latencyMs, migrationCount };
  } catch (error) {
    logger.warn({ err: error }, "Database health check failed");
    return { connected: false, latencyMs: null, migrationCount: null };
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
