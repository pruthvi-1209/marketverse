import { pgEnum } from "drizzle-orm/pg-core";

export const listingStatusEnum = pgEnum("listing_status", [
  "listed",
  "suspended",
  "delisted",
  "unknown",
]);

export const delayClassificationEnum = pgEnum("delay_classification", [
  "real_time",
  "delayed_1_3_min",
  "end_of_day",
  "unknown",
]);

export const transactionTypeEnum = pgEnum("transaction_type", ["buy", "sell"]);

export const alertTypeEnum = pgEnum("alert_type", [
  "price_threshold",
  "percent_change",
  "dma_crossover",
  "rsi_threshold",
  "volume_spike",
  "quality_score_change",
  "entry_score_change",
  "watchlist_event",
]);

export const alertOperatorEnum = pgEnum("alert_operator", [
  "above",
  "below",
  "crosses_above",
  "crosses_below",
  "change_above",
  "change_below",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "running",
  "success",
  "partial",
  "failed",
  "skipped",
]);

export const dataSourceKindEnum = pgEnum("data_source_kind", ["mcp", "rest", "manual", "derived"]);

export const periodTypeEnum = pgEnum("fundamental_period_type", ["annual", "quarterly", "ttm"]);
