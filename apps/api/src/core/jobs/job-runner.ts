import { logger } from "../logger/logger";
import { jobsRepository } from "../../database/repositories/jobs.repository";

export type JobOutcome = "success" | "partial" | "skipped";

export interface JobContext {
  attempt: number;
  jobName: string;
  logger: typeof logger;
}

export interface JobResult {
  status: JobOutcome;
  itemsProcessed?: number;
  details?: Record<string, unknown>;
  /** Set when the job completed but part of the work failed. */
  warning?: string;
}

export interface JobDefinition {
  name: string;
  description: string;
  /** Cron expression; empty string means "manual only". */
  schedule: string;
  enabled: boolean;
  run: (context: JobContext) => Promise<JobResult>;
}

export interface JobRunSummary {
  jobName: string;
  runId: string;
  status: "success" | "partial" | "failed" | "skipped";
  attempt: number;
  durationMs: number;
  itemsProcessed: number;
  errorMessage: string | null;
  details: Record<string, unknown> | null;
}

/**
 * Executes a job with bounded retries and persists every attempt to
 * `data_refresh_logs`. Failures never crash the process, and history is
 * append-only so an incident can always be reconstructed.
 */
export class JobRunner {
  constructor(
    private readonly jobs: Map<string, JobDefinition>,
    private readonly maxAttempts = 2,
  ) {}

  list(): JobDefinition[] {
    return [...this.jobs.values()];
  }

  get(name: string): JobDefinition | undefined {
    return this.jobs.get(name);
  }

  async run(name: string): Promise<JobRunSummary> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Unknown job '${name}'. Known jobs: ${[...this.jobs.keys()].join(", ")}`);
    }
    if (!job.enabled) {
      const run = await jobsRepository.startRun(name, 1);
      await jobsRepository.finishRun(run.id, {
        status: "skipped",
        details: { reason: "job is disabled by configuration" },
      });
      return {
        jobName: name,
        runId: run.id,
        status: "skipped",
        attempt: 1,
        durationMs: 0,
        itemsProcessed: 0,
        errorMessage: null,
        details: { reason: "job is disabled by configuration" },
      };
    }

    const attempts = Math.max(1, this.maxAttempts);
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const run = await jobsRepository.startRun(name, attempt);
      const startedAt = Date.now();
      try {
        const result = await job.run({ attempt, jobName: name, logger });
        const finished = Date.now();
        await jobsRepository.finishRun(run.id, {
          status: result.status,
          itemsProcessed: result.itemsProcessed ?? 0,
          errorMessage: result.status === "partial" ? (result.warning ?? null) : null,
          details: result.details ?? null,
        });
        logger.info(
          {
            job: name,
            attempt,
            status: result.status,
            durationMs: finished - startedAt,
            itemsProcessed: result.itemsProcessed ?? 0,
          },
          "Job completed",
        );
        return {
          jobName: name,
          runId: run.id,
          status: result.status,
          attempt,
          durationMs: finished - startedAt,
          itemsProcessed: result.itemsProcessed ?? 0,
          errorMessage: result.status === "partial" ? (result.warning ?? null) : null,
          details: result.details ?? null,
        };
      } catch (error) {
        lastError = error;
        const finished = Date.now();
        const message = error instanceof Error ? error.message : String(error);
        await jobsRepository.finishRun(run.id, {
          status: "failed",
          errorMessage: message,
          details: { attempt, attempts },
        });
        logger.error(
          { err: error, job: name, attempt, attempts, durationMs: finished - startedAt },
          "Job attempt failed",
        );
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    return {
      jobName: name,
      runId: "",
      status: "failed",
      attempt: attempts,
      durationMs: 0,
      itemsProcessed: 0,
      errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
      details: null,
    };
  }
}
