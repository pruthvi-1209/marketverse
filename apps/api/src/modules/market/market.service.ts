import type {
  IndexQuote,
  MarketBreadth,
  MarketMovers,
  Mover,
} from "@marketverse/contracts";
import { env } from "../../config/env";
import { logger } from "../../core/logger/logger";
import { storedResponseMeta } from "../../core/http/response-meta";
import { toNumber } from "../../core/utils/numbers";
import { toIstTradingDate } from "../../core/utils/time";
import { ProviderUnavailableError } from "../../core/errors/app-error";
import { getMarketDataProvider } from "../../providers";
import type { NormalizedIndexQuote, NormalizedMovers, NormalizedQuote } from "../../providers/types";
import { marketRepository } from "../../database/repositories/market.repository";
import { exchangeRepository } from "../../database/repositories/exchanges.repository";
import { db } from "../../database/client";
import { marketBreadth } from "../../database/schema";
import { desc, eq } from "drizzle-orm";
import type { ResponseMeta, MarketOverview } from "@marketverse/contracts";
import type { MarketBreadthRow } from "../../database/schema";

const KEY_INDICES = ["NIFTY 50", "NIFTY BANK", "NIFTY MIDCAP 100", "NIFTY SMLCAP 100", "INDIA VIX"];

function mapIndexQuote(normalized: NormalizedIndexQuote): IndexQuote {
  return {
    symbol: normalized.symbol,
    name: normalized.name,
    lastPrice: normalized.lastPrice,
    change: normalized.change,
    changePercent: normalized.changePercent,
    open: normalized.open,
    high: normalized.high,
    low: normalized.low,
    previousClose: normalized.previousClose,
    observedAt: normalized.provenance.observedAt?.toISOString() ?? null,
    tradingDate: normalized.provenance.tradingDate,
  };
}

function mapMover(quote: NormalizedQuote): Mover {
  return {
    symbol: quote.symbol,
    name: quote.name,
    lastPrice: quote.lastPrice,
    changePercent: quote.changePercent,
    volume: quote.volume,
  };
}

function mapBreadth(normalized: {
  tradingDate: string;
  advances: number | null;
  declines: number | null;
  unchanged: number | null;
  advanceDeclineRatio: number | null;
  totalVolume: number | null;
  provenance: { retrievedAt: Date; observedAt: Date | null };
}): MarketBreadth {
  return {
    advances: normalized.advances,
    declines: normalized.declines,
    unchanged: normalized.unchanged,
    advanceDeclineRatio: normalized.advanceDeclineRatio,
    newHighs: null,
    newLows: null,
    totalTradedVolume: normalized.totalVolume,
    totalTradedValue: null,
    asOf: normalized.provenance.observedAt?.toISOString() ?? normalized.provenance.retrievedAt.toISOString(),
  };
}

function mapStoredBreadth(row: MarketBreadthRow): MarketBreadth {
  return {
    advances: row.advances,
    declines: row.declines,
    unchanged: row.unchanged,
    advanceDeclineRatio: toNumber(row.advanceDeclineRatio),
    newHighs: null,
    newLows: null,
    totalTradedVolume: toNumber(row.totalVolume),
    totalTradedValue: null,
    asOf: row.observedAt.toISOString(),
  };
}

export class MarketService {
  private readonly provider = getMarketDataProvider();

  async indices(options: { group?: string; nameFilter?: string } = {}): Promise<{
    indices: IndexQuote[];
    meta: ResponseMeta;
  }> {
    try {
      const normalized = await this.provider.getIndices(options);
      await this.persistIndices(normalized);
      const first = normalized[0];
      return {
        indices: normalized.map(mapIndexQuote),
        meta: storedResponseMeta({
          provider: first?.provenance.provider ?? this.provider.name,
          observedAt: first?.provenance.observedAt ?? null,
          tradingDate: first?.provenance.tradingDate ?? toIstTradingDate(new Date()),
          delayClassification: first?.provenance.delayClassification ?? "delayed_1_3_min",
          retrievedAt: first?.provenance.retrievedAt ?? new Date(),
        }),
      };
    } catch (error) {
      logger.warn({ err: error }, "Live index feed unavailable; serving stored index quotes");
      const stored = await marketRepository.latestIndexQuotes(KEY_INDICES);
      if (stored.length === 0) throw error;
      return {
        indices: stored.map((row) => ({
          symbol: row.symbol,
          name: row.symbol,
          lastPrice: toNumber(row.lastPrice),
          change: toNumber(row.changeValue),
          changePercent: toNumber(row.changePercent),
          open: toNumber(row.open),
          high: toNumber(row.high),
          low: toNumber(row.low),
          previousClose: toNumber(row.previousClose),
          observedAt: row.observedAt.toISOString(),
          tradingDate: row.tradingDate,
        })),
        meta: storedResponseMeta({
          provider: stored[0]?.source ?? this.provider.name,
          observedAt: stored[0]?.observedAt ?? null,
          tradingDate: stored[0]?.tradingDate ?? null,
          delayClassification: "delayed_1_3_min",
          warnings: ["Live NSE index feed unavailable; showing the latest stored observations."],
        }),
      };
    }
  }

  private async persistIndices(indices: NormalizedIndexQuote[]): Promise<void> {
    const exchange = await exchangeRepository.ensureNse();
    for (const index of indices.slice(0, 60)) {
      const indexId = await marketRepository.upsertIndex({
        symbol: index.symbol,
        name: index.name,
        exchangeId: exchange.id,
        isBenchmark: index.symbol === env.BENCHMARK_INDEX_SYMBOL,
      });
      const observedAt = index.provenance.observedAt ?? index.provenance.retrievedAt;
      await marketRepository.insertIndexQuote({
        indexId,
        symbol: index.symbol,
        tradingDate: index.provenance.tradingDate ?? toIstTradingDate(observedAt),
        observedAt,
        lastPrice: index.lastPrice?.toFixed(4) ?? null,
        changeValue: index.change?.toFixed(4) ?? null,
        changePercent: index.changePercent?.toFixed(4) ?? null,
        open: index.open?.toFixed(4) ?? null,
        high: index.high?.toFixed(4) ?? null,
        low: index.low?.toFixed(4) ?? null,
        previousClose: index.previousClose?.toFixed(4) ?? null,
        source: index.provenance.provider,
        delayClassification: index.provenance.delayClassification,
        retrievedAt: index.provenance.retrievedAt,
      });
    }
  }

  async breadth(date?: string): Promise<{ breadth: MarketBreadth; meta: ResponseMeta }> {
    const tradingDate = date ?? toIstTradingDate(new Date());
    try {
      const normalized = await this.provider.getBreadth(tradingDate);
      await db
        .insert(marketBreadth)
        .values({
          tradingDate: normalized.tradingDate,
          advances: normalized.advances,
          declines: normalized.declines,
          unchanged: normalized.unchanged,
          advanceDeclineRatio: normalized.advanceDeclineRatio?.toFixed(4) ?? null,
          totalStocks: normalized.totalStocks,
          totalVolume: normalized.totalVolume?.toFixed(0) ?? null,
          observedAt: normalized.provenance.observedAt ?? normalized.provenance.retrievedAt,
          retrievedAt: normalized.provenance.retrievedAt,
          source: normalized.provenance.provider,
        })
        .onConflictDoUpdate({
          target: [marketBreadth.tradingDate, marketBreadth.source],
          set: {
            advances: normalized.advances,
            declines: normalized.declines,
            unchanged: normalized.unchanged,
            advanceDeclineRatio: normalized.advanceDeclineRatio?.toFixed(4) ?? null,
            totalStocks: normalized.totalStocks,
            totalVolume: normalized.totalVolume?.toFixed(0) ?? null,
            retrievedAt: normalized.provenance.retrievedAt,
          },
        });

      return {
        breadth: mapBreadth(normalized),
        meta: storedResponseMeta({
          provider: normalized.provenance.provider,
          observedAt: normalized.provenance.observedAt,
          tradingDate: normalized.tradingDate,
          delayClassification: normalized.provenance.delayClassification,
          retrievedAt: normalized.provenance.retrievedAt,
        }),
      };
    } catch (error) {
      const rows = await db
        .select()
        .from(marketBreadth)
        .orderBy(desc(marketBreadth.tradingDate))
        .limit(1);
      const stored = rows[0];
      if (!stored) {
        throw error instanceof ProviderUnavailableError
          ? error
          : new ProviderUnavailableError(this.provider.name, "market breadth unavailable");
      }
      return {
        breadth: mapStoredBreadth(stored),
        meta: storedResponseMeta({
          provider: stored.source,
          observedAt: stored.observedAt,
          tradingDate: stored.tradingDate,
          delayClassification: "end_of_day",
          warnings: ["Live breadth unavailable; showing the latest stored breadth."],
        }),
      };
    }
  }

  async movers(limit = 20): Promise<{ movers: MarketMovers; meta: ResponseMeta }> {
    const normalized: NormalizedMovers = await this.provider.getMovers({ limit });
    const movers: MarketMovers = {
      gainers: normalized.gainers.map(mapMover),
      losers: normalized.losers.map(mapMover),
      mostActiveByVolume: [],
      mostActiveByValue: [],
      weekHigh52: [],
      weekLow52: [],
    };
    return {
      movers,
      meta: storedResponseMeta({
        provider: normalized.provenance.provider,
        observedAt: normalized.provenance.observedAt,
        tradingDate: normalized.provenance.tradingDate,
        delayClassification: normalized.provenance.delayClassification,
        retrievedAt: normalized.provenance.retrievedAt,
      }),
    };
  }

  async overview(): Promise<{ overview: MarketOverview; meta: ResponseMeta }> {
    const warnings: string[] = [];
    const [indicesResult, breadthResult, moversResult] = await Promise.allSettled([
      this.indices({ group: "all" }),
      this.breadth(),
      this.movers(10),
    ]);

    const indices =
      indicesResult.status === "fulfilled"
        ? indicesResult.value.indices.filter((index) =>
            KEY_INDICES.some((key) => index.symbol.toUpperCase() === key),
          )
        : [];
    if (indicesResult.status === "rejected") warnings.push("Index data is unavailable.");
    if (indices.length === 0 && indicesResult.status === "fulfilled") {
      indices.push(...indicesResult.value.indices.slice(0, 10));
    }

    const breadth: MarketBreadth =
      breadthResult.status === "fulfilled"
        ? breadthResult.value.breadth
        : {
            advances: null,
            declines: null,
            unchanged: null,
            advanceDeclineRatio: null,
            newHighs: null,
            newLows: null,
            totalTradedVolume: null,
            totalTradedValue: null,
            asOf: null,
          };
    if (breadthResult.status === "rejected") warnings.push("Market breadth is unavailable.");

    const movers: MarketMovers =
      moversResult.status === "fulfilled"
        ? moversResult.value.movers
        : {
            gainers: [],
            losers: [],
            mostActiveByVolume: [],
            mostActiveByValue: [],
            weekHigh52: [],
            weekLow52: [],
          };
    if (moversResult.status === "rejected") warnings.push("Movers are unavailable.");

    const tradingDate =
      indicesResult.status === "fulfilled"
        ? (indicesResult.value.meta.tradingDate ?? toIstTradingDate(new Date()))
        : toIstTradingDate(new Date());

    return {
      overview: { indices, breadth, movers, tradingDate },
      meta: storedResponseMeta({
        provider: this.provider.name,
        observedAt:
          indicesResult.status === "fulfilled" &&
          indicesResult.value.indices[0]?.observedAt != null
            ? new Date(indicesResult.value.indices[0].observedAt)
            : null,
        tradingDate,
        delayClassification: "delayed_1_3_min",
        warnings,
      }),
    };
  }

  async indexHistory(symbol: string, limit: number): Promise<{
    points: Array<{ date: string; open: number | null; high: number | null; low: number | null; close: number | null }>;
    meta: ResponseMeta;
  }> {
    let rows = await marketRepository.indexHistoryForSymbol(symbol, limit);
    if (rows.length === 0) {
      const months = Math.max(1, Math.min(Math.ceil(limit / 21) + 1, 24));
      const fetched = await this.provider.getIndexHistory(symbol, months);
      if (fetched.length > 0) {
        const exchange = await exchangeRepository.ensureNse();
        const indexId = await marketRepository.upsertIndex({
          symbol,
          name: symbol,
          exchangeId: exchange.id,
          isBenchmark: symbol === env.BENCHMARK_INDEX_SYMBOL,
        });
        await marketRepository.insertIndexHistory(
          fetched.map((point) => ({
            indexId,
            symbol,
            tradingDate: point.tradingDate,
            open: point.open?.toFixed(4) ?? null,
            high: point.high?.toFixed(4) ?? null,
            low: point.low?.toFixed(4) ?? null,
            close: point.close?.toFixed(4) ?? null,
            changePercent: point.changePercent?.toFixed(4) ?? null,
            source: point.provenance.provider,
            retrievedAt: point.provenance.retrievedAt,
          })),
        );
        rows = await marketRepository.indexHistoryForSymbol(symbol, limit);
      }
    }

    return {
      points: rows.map((row) => ({
        date: row.tradingDate,
        open: toNumber(row.open),
        high: toNumber(row.high),
        low: toNumber(row.low),
        close: toNumber(row.close),
      })),
      meta: storedResponseMeta({
        provider: rows[0]?.source ?? this.provider.name,
        tradingDate: rows[0]?.tradingDate ?? null,
        delayClassification: "end_of_day",
      }),
    };
  }

  async volumeTrendFor(symbol: string): Promise<unknown> {
    const { marketDataService } = await import("../../services/market-data.service");
    const { snapshot } = await marketDataService.latestIndicators(symbol);
    const { volumeTrend } = await import("../indicators/calculations");
    const rows = await marketRepository.historyForStock(
      (await marketDataService.requireStock(symbol)).id,
      { limit: 60, order: "asc" },
    );
    const volumes = rows.map((row) => toNumber(row.volume)).filter((value): value is number => value !== null);
    return {
      symbol: symbol.toUpperCase(),
      averageVolume20: snapshot.values.averageVolume20,
      averageVolume50: snapshot.values.averageVolume50,
      latestVolume: volumes[volumes.length - 1] ?? null,
      relativeVolume: snapshot.values.relativeVolume,
      trend: volumes.length > 0 ? volumeTrend(volumes) : "unknown",
    };
  }
}

export const marketService = new MarketService();

export async function latestBreadthRow(): Promise<MarketBreadthRow | null> {
  const rows = await db
    .select()
    .from(marketBreadth)
    .orderBy(desc(marketBreadth.tradingDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function breadthCount(): Promise<number> {
  const rows = await db.select({ id: marketBreadth.id }).from(marketBreadth).where(eq(marketBreadth.source, "nse"));
  return rows.length;
}
