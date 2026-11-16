import type { JobDefinition } from "../core/jobs/job-runner";
import { env } from "../config/env";
import { marketService } from "../modules/market/market.service";
import { marketDataService } from "../services/market-data.service";
import { sleep, trackedSymbols } from "./tracked-symbols";

/**
 * Refreshes index snapshots, market breadth and stored quotes for every tracked
 * symbol. Partial failures are reported as `partial` with the failing datasets
 * named; the job never substitutes synthetic values.
 */
export const marketRefreshJob: JobDefinition = {
  name: "market-refresh",
  description: "Refreshes index snapshots, market breadth and quotes for tracked symbols.",
  schedule: env.JOB_MARKET_REFRESH_CRON,
  enabled: true,
  async run({ logger }) {
    const details: Record<string, unknown> = {};
    const warnings: string[] = [];

    try {
      const indices = await marketService.indices({ group: "broad" });
      details.indices = indices.indices.length;
    } catch (error) {
      warnings.push("index snapshot failed");
      details.indicesError = error instanceof Error ? error.message : String(error);
      logger.warn({ err: error }, "Index refresh failed");
    }

    try {
      const breadth = await marketService.breadth();
      details.breadthAdvances = breadth.breadth.advances;
      details.breadthDeclines = breadth.breadth.declines;
    } catch (error) {
      warnings.push("market breadth failed");
      details.breadthError = error instanceof Error ? error.message : String(error);
      logger.warn({ err: error }, "Breadth refresh failed");
    }

    const symbols = await trackedSymbols();
    let stored = 0;
    try {
      const result = await marketDataService.refreshQuotes(symbols);
      stored = result.stored;
      details.requested = result.requested;
      details.missingSymbols = result.missing.slice(0, 50);
      if (result.missing.length > 0) {
        warnings.push(`${result.missing.length} symbols had no quote in the bulk response`);
      }
    } catch (error) {
      warnings.push("bulk quote refresh failed");
      details.quotesError = error instanceof Error ? error.message : String(error);
      logger.warn({ err: error }, "Bulk quote refresh failed");
    }

    details.warnings = warnings;
    return {
      status: warnings.length > 0 ? "partial" : "success",
      itemsProcessed: stored,
      details,
      warning: warnings.length > 0 ? warnings.join("; ") : undefined,
    };
  },
};

/** Synchronises daily OHLCV history for tracked symbols, one request at a time. */
export const historySyncJob: JobDefinition = {
  name: "history-sync",
  description: "Synchronises daily OHLCV history for tracked symbols from NSE bhavcopy.",
  schedule: env.JOB_HISTORY_SYNC_CRON,
  enabled: true,
  async run({ logger }) {
    const symbols = await trackedSymbols();
    const failures: Array<{ symbol: string; error: string }> = [];
    let inserted = 0;

    for (const symbol of symbols) {
      try {
        inserted += await marketDataService.syncDailyHistory(symbol, env.HISTORY_SYNC_MONTHS);
      } catch (error) {
        failures.push({
          symbol,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.warn({ err: error, symbol }, "History sync failed for symbol");
      }
      // Be a polite client of the public NSE endpoint.
      await sleep(150);
    }

    const details = {
      symbols: symbols.length,
      inserted,
      failures: failures.slice(0, 50),
      failureCount: failures.length,
    };
    return {
      status: failures.length === 0 ? "success" : failures.length === symbols.length ? "skipped" : "partial",
      itemsProcessed: inserted,
      details,
      warning:
        failures.length > 0
          ? `history sync failed for ${failures.length}/${symbols.length} symbols`
          : undefined,
    };
  },
};

/** Recomputes technical indicators from stored history. */
export const indicatorsJob: JobDefinition = {
  name: "indicators",
  description: "Recomputes technical indicators for tracked symbols from stored history.",
  schedule: env.JOB_INDICATORS_CRON,
  enabled: true,
  async run({ logger }) {
    const symbols = await trackedSymbols();
    const failures: Array<{ symbol: string; error: string }> = [];
    let processed = 0;

    for (const symbol of symbols) {
      try {
        const result = await marketDataService.computeIndicators(symbol, { persist: true });
        if (result.snapshot.observationsUsed > 0) processed += 1;
      } catch (error) {
        failures.push({ symbol, error: error instanceof Error ? error.message : String(error) });
        logger.warn({ err: error, symbol }, "Indicator computation failed");
      }
    }

    return {
      status: failures.length === 0 ? "success" : processed === 0 ? "skipped" : "partial",
      itemsProcessed: processed,
      details: { symbols: symbols.length, failures: failures.slice(0, 50), failureCount: failures.length },
      warning:
        failures.length > 0 ? `indicator computation failed for ${failures.length} symbols` : undefined,
    };
  },
};
