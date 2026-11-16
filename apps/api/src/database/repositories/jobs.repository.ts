import { desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { dataRefreshLogs, type DataRefreshLogRow } from "../schema";

export type JobRunStatus = "running" | "success" | "partial" | "failed" | "skipped";

export const jobsRepository = {
  async startRun(jobName: string, attempt = 1): Promise<DataRefreshLogRow> {
    const rows = await db
      .insert(dataRefreshLogs)
      .values({ jobName, status: "running", startedAt: new Date(), attempt })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to start job run");
    return row;
  },

  async finishRun(
    id: string,
    input: {
      status: Exclude<JobRunStatus, "running">;
      itemsProcessed?: number;
      errorMessage?: string | null;
      details?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const startedAtRows = await db
      .select({ startedAt: dataRefreshLogs.startedAt })
      .from(dataRefreshLogs)
      .where(eq(dataRefreshLogs.id, id))
      .limit(1);
    const startedAt = startedAtRows[0]?.startedAt ?? new Date();
    await db
      .update(dataRefreshLogs)
      .set({
        status: input.status,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        itemsProcessed: input.itemsProcessed ?? 0,
        errorMessage: input.errorMessage ?? null,
        details: input.details ?? null,
      })
      .where(eq(dataRefreshLogs.id, id));
  },

  async latestRuns(limit = 20): Promise<DataRefreshLogRow[]> {
    return db.select().from(dataRefreshLogs).orderBy(desc(dataRefreshLogs.startedAt)).limit(limit);
  },

  async runsForJob(jobName: string, limit = 20): Promise<DataRefreshLogRow[]> {
    return db
      .select()
      .from(dataRefreshLogs)
      .where(eq(dataRefreshLogs.jobName, jobName))
      .orderBy(desc(dataRefreshLogs.startedAt))
      .limit(limit);
  },

  async latestRunForJob(jobName: string): Promise<DataRefreshLogRow | null> {
    const rows = await db
      .select()
      .from(dataRefreshLogs)
      .where(eq(dataRefreshLogs.jobName, jobName))
      .orderBy(desc(dataRefreshLogs.startedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async consecutiveFailures(jobName: string): Promise<number> {
    const runs = await this.runsForJob(jobName, 20);
    let failures = 0;
    for (const run of runs) {
      if (run.status === "failed") failures += 1;
      else break;
    }
    return failures;
  },

  async lastSuccess(jobName: string): Promise<DataRefreshLogRow | null> {
    const rows = await db
      .select()
      .from(dataRefreshLogs)
      .where(sql`${dataRefreshLogs.jobName} = ${jobName} and ${dataRefreshLogs.status} = 'success'`)
      .orderBy(desc(dataRefreshLogs.startedAt))
      .limit(1);
    return rows[0] ?? null;
  },
};
