import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { jobStatusEnum } from "./enums";

/**
 * Execution history for every background job and data refresh. Rows are never
 * overwritten, so a failure can always be correlated with the observed state.
 */
export const dataRefreshLogs = pgTable(
  "data_refresh_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobName: text("job_name").notNull(),
    status: jobStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    attempt: integer("attempt").notNull().default(1),
    itemsProcessed: integer("items_processed").notNull().default(0),
    errorMessage: text("error_message"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("data_refresh_logs_job_started_idx").on(table.jobName, table.startedAt.desc()),
    index("data_refresh_logs_status_idx").on(table.status),
  ],
);

export type DataRefreshLogRow = typeof dataRefreshLogs.$inferSelect;
