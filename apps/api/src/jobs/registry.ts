import { env } from "../config/env";
import { JobRunner, type JobDefinition } from "../core/jobs/job-runner";
import { alertsJob, newsJob, scoresJob } from "./analysis.jobs";
import { historySyncJob, indicatorsJob, marketRefreshJob } from "./market.jobs";
import { dataQualityJob } from "./quality.jobs";

export const JOB_DEFINITIONS: JobDefinition[] = [
  marketRefreshJob,
  historySyncJob,
  indicatorsJob,
  scoresJob,
  alertsJob,
  newsJob,
  dataQualityJob,
];

export function createJobRunner(): JobRunner {
  return new JobRunner(
    new Map(JOB_DEFINITIONS.map((job) => [job.name, job])),
    env.JOB_MAX_ATTEMPTS,
  );
}

export const jobRunner = createJobRunner();
