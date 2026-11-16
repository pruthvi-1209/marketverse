import { sql } from "drizzle-orm";
import type {
  DataFreshnessEntry,
  JobRun,
  JobSummary,
  NseToolSummary,
  ProviderStatus,
  SystemStatus,
} from "@marketverse/contracts";
import { env } from "../../config/env";
import { NotFoundError } from "../../core/errors/app-error";
import { storedResponseMeta } from "../../core/http/response-meta";
import { getNseProvider } from "../../providers";
import { NSE_TOOL_CAPABILITIES, NSE_SERVER_LABELS } from "../../providers/nse/tool-catalog";
import { checkDatabaseHealth } from "../../database/client";
import { alertRepository } from "../../database/repositories/alerts.repository";
import { jobsRepository } from "../../database/repositories/jobs.repository";
import { marketRepository } from "../../database/repositories/market.repository";
import { stocksRepository } from "../../database/repositories/stocks.repository";
import { watchlistRepository } from "../../database/repositories/watchlist.repository";
import { JOB_DEFINITIONS, jobRunner } from "../../jobs/registry";
import { schedulerInfo } from "../../jobs/scheduler";
import type { ResponseMeta } from "@marketverse/contracts";
import type { DataRefreshLogRow } from "../../database/schema";

const startedAt = new Date();

function mapJobRun(row: DataRefreshLogRow | null): JobRun | null {
  if (!row) return null;
  return {
    id: row.id,
    jobName: row.jobName,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    durationMs: row.durationMs,
    attempt: row.attempt,
    itemsProcessed: row.itemsProcessed,
    errorMessage: row.errorMessage,
    details: row.details ?? null,
  };
}

interface DatasetQuery {
  dataset: string;
  source: string;
  sql: ReturnType<typeof sql>;
  staleAfterSeconds: number;
  notes: string[];
}

const DATASETS: DatasetQuery[] = [
  {
    dataset: "market_quotes",
    source: "nse",
    sql: sql`select max(observed_at) as newest, max(trading_date) as trading_date, count(*)::int as count from market_quotes`,
    staleAfterSeconds: env.QUOTE_STALE_AFTER_SECONDS,
    notes: ["Delayed observations; end-of-day when the bhavcopy feed is the only source."],
  },
  {
    dataset: "historical_prices",
    source: "nse",
    sql: sql`select max(retrieved_at) as newest, max(trading_date) as trading_date, count(*)::int as count from historical_prices`,
    staleAfterSeconds: env.HISTORY_STALE_AFTER_HOURS * 3600,
    notes: ["Official daily bhavcopy data; unadjusted for corporate actions."],
  },
  {
    dataset: "technical_indicators",
    source: "marketverse-derived",
    sql: sql`select max(calculated_at) as newest, max(as_of_date) as trading_date, count(*)::int as count from technical_indicators`,
    staleAfterSeconds: env.HISTORY_STALE_AFTER_HOURS * 3600,
    notes: ["Derived from stored daily closes; each row records its calculation timestamp and version."],
  },
  {
    dataset: "investment_scores",
    source: "marketverse-derived",
    sql: sql`select max(calculated_at) as newest, max(as_of_date) as trading_date, count(*)::int as count from investment_scores`,
    staleAfterSeconds: env.HISTORY_STALE_AFTER_HOURS * 3600,
    notes: ["Quality scores award no points for missing data."],
  },
  {
    dataset: "entry_scores",
    source: "marketverse-derived",
    sql: sql`select max(calculated_at) as newest, max(as_of_date) as trading_date, count(*)::int as count from entry_scores`,
    staleAfterSeconds: env.HISTORY_STALE_AFTER_HOURS * 3600,
    notes: ["Entry timing scores are independent from investment quality."],
  },
  {
    dataset: "index_history",
    source: "nse",
    sql: sql`select max(retrieved_at) as newest, max(trading_date) as trading_date, count(*)::int as count from index_history`,
    staleAfterSeconds: env.HISTORY_STALE_AFTER_HOURS * 3600,
    notes: ["Used for benchmark comparison."],
  },
  {
    dataset: "market_breadth",
    source: "nse",
    sql: sql`select max(observed_at) as newest, max(trading_date) as trading_date, count(*)::int as count from market_breadth`,
    staleAfterSeconds: 24 * 3600,
    notes: ["Advance/decline counts are end-of-day bhavcopy figures."],
  },
  {
    dataset: "news_articles",
    source: "configured-provider",
    sql: sql`select max(published_at) as newest, max(published_at)::date as trading_date, count(*)::int as count from news_articles`,
    staleAfterSeconds: 24 * 3600,
    notes: ["Empty unless a licensed news provider or manual import supplies articles."],
  },
  {
    dataset: "alert_events",
    source: "marketverse",
    sql: sql`select max(triggered_at) as newest, null::date as trading_date, count(*)::int as count from alert_events`,
    staleAfterSeconds: 24 * 3600,
    notes: ["One event per alert per trading date; delivery channel is recorded."],
  },
];

export class SystemService {
  async status(): Promise<{ status: SystemStatus; meta: ResponseMeta }> {
    const [database, stocks, quotes, historicalPrices, watchlists, alerts] = await Promise.all([
      checkDatabaseHealth(),
      stocksRepository.count(),
      marketRepository.quoteCount(),
      marketRepository.historyCount(),
      watchlistRepository.count(),
      alertRepository.count(),
    ]);

    const scheduled = schedulerInfo().filter((job) => job.running).length;
    const providers = this.providerStatuses();
    const nseDown = providers.some((provider) => provider.enabled && provider.status === "unavailable");
    const overall: SystemStatus["status"] =
      !database.connected ? "error" : nseDown ? "degraded" : "ok";

    return {
      status: {
        status: overall,
        version: env.APP_VERSION,
        environment: env.NODE_ENV,
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        database: {
          connected: database.connected,
          latencyMs: database.latencyMs,
          migrationCount: database.migrationCount,
        },
        providers,
        jobs: { enabled: env.JOBS_ENABLED, scheduled },
        counts: { stocks, quotes, historicalPrices, watchlists, alerts },
      },
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  providerStatuses(): ProviderStatus[] {
    const nse = getNseProvider();
    const build = (
      key: "nse-bhavcopy" | "nse-cm-market",
      connection: typeof nse.bhavcopy,
    ): ProviderStatus => {
      const status = connection.getStatus();
      return {
        name: key,
        url: connection.url,
        enabled: env.NSE_MCP_ENABLED,
        status: env.NSE_MCP_ENABLED ? status.status : "disabled",
        detail: status.detail,
        toolCount: status.toolCount,
        lastConnectedAt: status.lastConnectedAt ? status.lastConnectedAt.toISOString() : null,
        lastErrorAt: status.lastErrorAt ? status.lastErrorAt.toISOString() : null,
        capabilities: Object.keys(NSE_TOOL_CAPABILITIES[key]),
      };
    };
    return [
      build("nse-bhavcopy", nse.bhavcopy),
      build("nse-cm-market", nse.cmMarket),
    ];
  }

  async tools(): Promise<{ tools: NseToolSummary[]; meta: ResponseMeta }> {
    const nse = getNseProvider();
    const catalog = await nse.toolCatalog();
    const tools: NseToolSummary[] = catalog.map(({ server, tool }) => {
      const supported = Object.values(NSE_TOOL_CAPABILITIES[server]).includes(
        tool.name as never,
      );
      return {
        provider: server,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        requiredFields: tool.requiredFields,
        discoveredAt: tool.discoveredAt,
        supported,
        notes: supported ? [] : ["Discovered on the live server but not used by this build."],
      };
    });

    const warnings: string[] = [];
    if (tools.length === 0) {
      warnings.push(
        "No NSE tool catalogue is available. Check connectivity and NSE_MCP_ENABLED; nothing is assumed.",
      );
    }
    return {
      tools,
      meta: storedResponseMeta({
        provider: env.NSE_MCP_ENABLED ? "nse" : "marketverse",
        warnings,
      }),
    };
  }

  async freshness(): Promise<{ datasets: DataFreshnessEntry[]; meta: ResponseMeta }> {
    const now = Date.now();
    const datasets: DataFreshnessEntry[] = [];

    for (const dataset of DATASETS) {
      try {
        const result = await dbQuery(dataset.sql);
        const newest = result.newest ? new Date(result.newest) : null;
        const ageSeconds =
          newest === null ? null : Math.max(0, Math.round((now - newest.getTime()) / 1000));
        const status: DataFreshnessEntry["status"] =
          result.count === 0
            ? "missing"
            : ageSeconds === null
              ? "unknown"
              : ageSeconds <= dataset.staleAfterSeconds
                ? "fresh"
                : "stale";
        datasets.push({
          dataset: dataset.dataset,
          source: dataset.source,
          newestObservationAt: newest ? newest.toISOString() : null,
          tradingDate: result.trading_date ? String(result.trading_date).slice(0, 10) : null,
          ageSeconds,
          status,
          rowCount: result.count,
          notes: dataset.notes,
        });
      } catch (error) {
        datasets.push({
          dataset: dataset.dataset,
          source: dataset.source,
          newestObservationAt: null,
          tradingDate: null,
          ageSeconds: null,
          status: "unknown",
          rowCount: 0,
          notes: [
            ...dataset.notes,
            error instanceof Error ? `Query failed: ${error.message}` : "Query failed",
          ],
        });
      }
    }

    return { datasets, meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async jobs(): Promise<{ jobs: JobSummary[]; meta: ResponseMeta }> {
    const jobs: JobSummary[] = [];
    for (const definition of JOB_DEFINITIONS) {
      const [lastRun, failures] = await Promise.all([
        jobsRepository.latestRunForJob(definition.name),
        jobsRepository.consecutiveFailures(definition.name),
      ]);
      jobs.push({
        name: definition.name,
        schedule: definition.schedule,
        enabled: definition.enabled && env.JOBS_ENABLED,
        lastRun: mapJobRun(lastRun),
        consecutiveFailures: failures,
      });
    }
    return { jobs, meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async jobRuns(limit = 30): Promise<{ runs: JobRun[]; meta: ResponseMeta }> {
    const rows = await jobsRepository.latestRuns(limit);
    return {
      runs: rows.map((row) => mapJobRun(row) as JobRun),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async runJob(name: string): Promise<{
    summary: Awaited<ReturnType<typeof jobRunner.run>>;
    meta: ResponseMeta;
  }> {
    if (!jobRunner.get(name)) {
      throw new NotFoundError("Job", name);
    }
    const summary = await jobRunner.run(name);
    return { summary, meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  labels(): Record<"nse-bhavcopy" | "nse-cm-market", string> {
    return NSE_SERVER_LABELS;
  }
}

async function dbQuery(query: ReturnType<typeof sql>): Promise<{
  newest: string | null;
  trading_date: string | null;
  count: number;
}> {
  const { db } = await import("../../database/client");
  const result = await db.execute<{
    newest: string | Date | null;
    trading_date: string | Date | null;
    count: number;
  }>(query);
  const row = result.rows[0];
  if (!row) return { newest: null, trading_date: null, count: 0 };
  const toIso = (value: string | Date | null): string | null => {
    if (value === null) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  return {
    newest: toIso(row.newest),
    trading_date: row.trading_date === null ? null : String(row.trading_date),
    count: Number(row.count),
  };
}

export const systemService = new SystemService();
