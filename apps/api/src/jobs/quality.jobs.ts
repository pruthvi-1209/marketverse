import { sql } from "drizzle-orm";
import type { JobDefinition } from "../core/jobs/job-runner";
import { env } from "../config/env";
import { db } from "../database/client";

interface CountRow {
  [key: string]: unknown;
  count: number;
}

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute<CountRow>(query);
  const row = result.rows[0];
  return row ? Number(row.count) : 0;
}

/**
 * Read-only integrity sweep. It reports what is missing or suspicious so an
 * operator can act; it never deletes or "repairs" data silently.
 */
export const dataQualityJob: JobDefinition = {
  name: "data-quality",
  description: "Audits stored market data for staleness, gaps and invalid values.",
  schedule: env.JOB_DATA_QUALITY_CRON,
  enabled: true,
  async run({ logger }) {
    const staleHours = Math.max(1, Math.ceil(env.HISTORY_STALE_AFTER_HOURS));

    const [stocks, staleQuotes, stocksWithoutHistory, stocksWithoutIndicators, stocksWithoutScores] =
      await Promise.all([
        scalar(sql`select count(*)::int as count from stocks`),
        scalar(sql`
          select count(*)::int as count from (
            select distinct on (stock_id) stock_id, observed_at
            from market_quotes
            order by stock_id, observed_at desc
          ) latest
          where observed_at < now() - (${staleHours} || ' hours')::interval
        `),
        scalar(sql`
          select count(*)::int as count from stocks s
          where not exists (select 1 from historical_prices h where h.stock_id = s.id)
        `),
        scalar(sql`
          select count(*)::int as count from stocks s
          where exists (select 1 from historical_prices h where h.stock_id = s.id)
            and not exists (select 1 from technical_indicators t where t.stock_id = s.id)
        `),
        scalar(sql`
          select count(*)::int as count from stocks s
          where exists (select 1 from historical_prices h where h.stock_id = s.id)
            and not exists (select 1 from investment_scores i where i.stock_id = s.id)
        `),
      ]);

    const [nonPositivePrices, orphanWatchlistItems, negativeVolumes] = await Promise.all([
      scalar(sql`
        select count(*)::int as count from market_quotes
        where last_price is not null and last_price <= 0
      `),
      scalar(sql`
        select count(*)::int as count from watchlist_items w
        where not exists (select 1 from stocks s where s.id = w.stock_id)
      `),
      scalar(sql`select count(*)::int as count from historical_prices where volume < 0`),
    ]);

    const issues =
      staleQuotes +
      stocksWithoutHistory +
      stocksWithoutIndicators +
      stocksWithoutScores +
      nonPositivePrices +
      orphanWatchlistItems +
      negativeVolumes;

    const details = {
      stocks,
      staleQuotes,
      stocksWithoutHistory,
      stocksWithoutIndicators,
      stocksWithoutScores,
      nonPositivePrices,
      orphanWatchlistItems,
      negativeVolumes,
      staleQuoteThresholdHours: staleHours,
    };

    logger.info(details, "Data quality sweep completed");

    return {
      status: issues === 0 ? "success" : "partial",
      itemsProcessed: stocks,
      details,
      warning: issues === 0 ? undefined : `${issues} data quality issues were detected`,
    };
  },
};
