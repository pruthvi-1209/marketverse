import type { JobDefinition } from "../core/jobs/job-runner";
import { env } from "../config/env";
import { alertsService } from "../modules/alerts/alerts.service";
import { newsService } from "../modules/news/news.service";
import { scoringService } from "../services/scoring.service";

export const scoresJob: JobDefinition = {
  name: "scores",
  description: "Recalculates investment quality and entry timing scores for all stored stocks.",
  schedule: env.JOB_SCORES_CRON,
  enabled: true,
  async run() {
    const result = await scoringService.recalculateAll();
    return {
      status: result.failed === 0 ? "success" : result.processed === 0 ? "skipped" : "partial",
      itemsProcessed: result.processed,
      details: result,
      warning: result.failed > 0 ? `score calculation failed for ${result.failed} stocks` : undefined,
    };
  },
};

export const alertsJob: JobDefinition = {
  name: "alerts",
  description: "Evaluates enabled price, technical and score alerts against stored data.",
  schedule: env.JOB_ALERTS_CRON,
  enabled: true,
  async run() {
    const summary = await alertsService.evaluateAll();
    return {
      status: summary.errors === 0 ? "success" : summary.evaluated === 0 ? "skipped" : "partial",
      itemsProcessed: summary.triggered,
      details: {
        evaluated: summary.evaluated,
        triggered: summary.triggered,
        skipped: summary.skipped,
        errors: summary.errors,
        details: summary.details.slice(0, 100),
      },
      warning: summary.errors > 0 ? `${summary.errors} alert evaluations failed` : undefined,
    };
  },
};

export const newsJob: JobDefinition = {
  name: "news",
  description: "Fetches headlines from the configured licensed news provider, if any.",
  schedule: env.JOB_NEWS_CRON,
  enabled: true,
  async run() {
    const result = await newsService.refresh();
    return {
      status: result.skipped ? "skipped" : "success",
      itemsProcessed: result.inserted,
      details: result,
      warning: result.reason ?? undefined,
    };
  },
};
