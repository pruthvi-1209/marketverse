import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { logger } from "../core/logger/logger";
import { JOB_DEFINITIONS, jobRunner } from "./registry";

const tasks = new Map<string, ScheduledTask>();

export interface ScheduledJobInfo {
  name: string;
  schedule: string;
  enabled: boolean;
  running: boolean;
}

/**
 * Starts cron schedules in the exchange's timezone. `JOBS_ENABLED=false` keeps
 * the process API-only, which is the default so a developer's laptop does not
 * hammer NSE. Jobs can always be triggered manually through the system route.
 */
export function startScheduler(): void {
  if (!env.JOBS_ENABLED) {
    logger.info("Background scheduler is disabled (JOBS_ENABLED=false)");
    return;
  }
  if (tasks.size > 0) return;

  for (const job of JOB_DEFINITIONS) {
    if (!job.enabled || job.schedule.trim().length === 0) continue;
    if (!cron.validate(job.schedule)) {
      logger.warn({ job: job.name, schedule: job.schedule }, "Invalid cron expression; job not scheduled");
      continue;
    }
    const task = cron.schedule(
      job.schedule,
      async () => {
        try {
          await jobRunner.run(job.name);
        } catch (error) {
          logger.error({ err: error, job: job.name }, "Scheduled job failed unexpectedly");
        }
      },
      {
        timezone: env.MARKET_TIMEZONE,
        name: job.name,
        noOverlap: true,
      },
    );
    tasks.set(job.name, task);
    logger.info({ job: job.name, schedule: job.schedule }, "Scheduled background job");
  }
}

export async function stopScheduler(): Promise<void> {
  for (const [name, task] of tasks) {
    task.stop();
    logger.debug({ job: name }, "Stopped scheduled job");
  }
  tasks.clear();
}

export function schedulerInfo(): ScheduledJobInfo[] {
  return JOB_DEFINITIONS.map((job) => ({
    name: job.name,
    schedule: job.schedule,
    enabled: job.enabled && env.JOBS_ENABLED,
    running: tasks.has(job.name),
  }));
}
