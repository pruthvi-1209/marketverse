import type { IndicatorSnapshot, ResponseMeta } from "@marketverse/contracts";
import { INDICATOR_VERSION } from "@marketverse/contracts";
import { env } from "../config/env";
import { logger } from "../core/logger/logger";
import { buildResponseMeta } from "../core/http/response-meta";
import { istCloseInstant, toIstTradingDate, freshnessFor } from "../core/utils/time";
import { toNumber } from "../core/utils/numbers";
import {
  DataUnavailableError,
  NotFoundError,
  ProviderUnavailableError,
} from "../core/errors/app-error";
import { getMarketDataProvider } from "../providers";
import type { MarketDataProvider, NormalizedCandle, NormalizedQuote, Provenance } from "../providers/types";
import { exchangeRepository } from "../database/repositories/exchanges.repository";
import { marketRepository } from "../database/repositories/market.repository";
import { stocksRepository } from "../database/repositories/stocks.repository";
import { indicatorsRepository } from "../database/repositories/indicators.repository";
import { computeIndicators } from "../modules/indicators/calculations";
import type { HistoricalPriceRow, MarketQuoteRow, Stock as StockRow } from "../database/schema";

export interface QuoteResult {
  row: MarketQuoteRow;
  meta: ResponseMeta;
}

export class MarketDataService {
  constructor(private readonly provider: MarketDataProvider = getMarketDataProvider()) {}

  async ensureStock(symbol: string, name?: string | null): Promise<StockRow> {
    const normalized = symbol.trim().toUpperCase();
    const existing = await stocksRepository.findBySymbol(normalized);
    if (existing) {
      if (name && !existing.name) {
        return stocksRepository.upsert({
          id: existing.id,
          symbol: existing.symbol,
          name,
          isin: existing.isin,
          exchangeId: existing.exchangeId,
          sector: existing.sector,
          industry: existing.industry,
          listingStatus: existing.listingStatus,
          instrumentType: existing.instrumentType,
          dataSource: existing.dataSource,
          sourceUpdatedAt: existing.sourceUpdatedAt,
          lastUpdatedAt: existing.lastUpdatedAt,
        });
      }
      return existing;
    }
    const exchange = await exchangeRepository.ensureNse();
    return stocksRepository.upsert({
      symbol: normalized,
      name: name ?? null,
      exchangeId: exchange.id,
      listingStatus: "listed",
      instrumentType: "equity",
      dataSource: this.provider.name,
      lastUpdatedAt: new Date(),
    });
  }

  private resolveObservation(quote: NormalizedQuote): {
    observedAt: Date;
    tradingDate: string;
  } {
    const tradingDate = quote.provenance.tradingDate ?? null;
    const observedAt = quote.provenance.observedAt ?? (tradingDate ? istCloseInstant(tradingDate) : new Date());
    return {
      observedAt,
      tradingDate: tradingDate ?? toIstTradingDate(observedAt),
    };
  }

  private async persistQuote(stockId: string, quote: NormalizedQuote): Promise<MarketQuoteRow | null> {
    const { observedAt, tradingDate } = this.resolveObservation(quote);
    await marketRepository.insertQuotes([
      {
        values: {
          stockId,
          symbol: quote.symbol,
          exchangeCode: "NSE",
          tradingDate,
          observedAt,
          lastPrice: quote.lastPrice?.toFixed(4) ?? null,
          changeValue: quote.change?.toFixed(4) ?? null,
          changePercent: quote.changePercent?.toFixed(4) ?? null,
          open: quote.open?.toFixed(4) ?? null,
          high: quote.high?.toFixed(4) ?? null,
          low: quote.low?.toFixed(4) ?? null,
          previousClose: quote.previousClose?.toFixed(4) ?? null,
          volume: quote.volume === null ? null : Math.round(quote.volume),
          turnover: quote.turnover?.toFixed(4) ?? null,
          yearHigh: quote.yearHigh?.toFixed(4) ?? null,
          yearLow: quote.yearLow?.toFixed(4) ?? null,
          source: quote.provenance.provider,
          tool: quote.provenance.tool,
          delayClassification: quote.provenance.delayClassification,
          retrievedAt: quote.provenance.retrievedAt,
        },
        raw: quote.provenance.raw ?? null,
      },
    ]);
    await stocksRepository.touchUpdatedAt(quote.symbol, quote.provenance.retrievedAt);
    return marketRepository.latestQuote(stockId);
  }

  private quoteMeta(row: MarketQuoteRow, cached: boolean, warnings: string[] = []): ResponseMeta {
    return buildResponseMeta(
      {
        provider: row.source,
        tool: row.tool,
        retrievedAt: row.retrievedAt,
        observedAt: row.observedAt,
        tradingDate: row.tradingDate,
        delayClassification: row.delayClassification,
      },
      { cached, warnings, staleAfterSeconds: env.QUOTE_STALE_AFTER_SECONDS },
    );
  }

  /**
   * Returns the freshest usable quote. Stored fresh data is preferred so NSE is
   * not queried repeatedly; on provider failure an existing (stale) row is
   * returned with an explicit warning rather than fabricating numbers.
   */
  async getQuote(symbol: string, options: { refresh?: boolean } = {}): Promise<QuoteResult> {
    const stock = await this.ensureStock(symbol);
    const existing = await marketRepository.latestQuote(stock.id);

    if (existing && !options.refresh) {
      const freshness = freshnessFor(existing.observedAt, env.QUOTE_STALE_AFTER_SECONDS);
      if (freshness.status === "fresh") {
        return { row: existing, meta: this.quoteMeta(existing, true) };
      }
    }

    try {
      const quote = await this.provider.getQuote({ symbol: stock.symbol });
      const stored = await this.persistQuote(stock.id, quote);
      if (!stored) throw new DataUnavailableError(`Unable to persist quote for ${stock.symbol}`);
      return { row: stored, meta: this.quoteMeta(stored, false) };
    } catch (error) {
      if (existing) {
        logger.warn({ err: error, symbol }, "Provider quote failed; serving stored observation");
        return {
          row: existing,
          meta: this.quoteMeta(existing, true, [
            "Live refresh failed. Serving the most recent stored observation, which may be stale.",
          ]),
        };
      }
      throw error instanceof ProviderUnavailableError
        ? error
        : new ProviderUnavailableError(
            this.provider.name,
            error instanceof Error ? error.message : "quote request failed",
          );
    }
  }

  async syncDailyHistory(symbol: string, months = 12): Promise<number> {
    const stock = await this.ensureStock(symbol);
    const candles = await this.provider.getDailyHistory({ symbol: stock.symbol, months });
    if (candles.length === 0) return 0;
    const rows = candles.map((candle) => this.historyRow(stock.id, candle));
    return marketRepository.insertHistory(rows);
  }

  /**
   * Refreshes many symbols through the provider's bulk endpoint and persists
   * each observation. Symbols the provider does not return are reported, never
   * filled with placeholders.
   */
  async refreshQuotes(symbols: string[]): Promise<{
    requested: number;
    stored: number;
    missing: string[];
  }> {
    const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))].filter(
      (symbol) => symbol.length > 0,
    );
    if (unique.length === 0) return { requested: 0, stored: 0, missing: [] };

    const quotes = await this.provider.getQuotes(unique);
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    let stored = 0;
    const missing: string[] = [];

    for (const symbol of unique) {
      const quote = bySymbol.get(symbol);
      if (!quote) {
        missing.push(symbol);
        continue;
      }
      const stock = await this.ensureStock(symbol);
      const row = await this.persistQuote(stock.id, quote);
      if (row) stored += 1;
      else missing.push(symbol);
    }
    return { requested: unique.length, stored, missing };
  }

  private historyRow(stockId: string, candle: NormalizedCandle): typeof import("../database/schema").historicalPrices.$inferInsert {
    return {
      stockId,
      symbol: candle.symbol,
      tradingDate: candle.tradingDate,
      open: candle.open?.toFixed(4) ?? null,
      high: candle.high?.toFixed(4) ?? null,
      low: candle.low?.toFixed(4) ?? null,
      close: candle.close?.toFixed(4) ?? null,
      previousClose: candle.previousClose?.toFixed(4) ?? null,
      volume: candle.volume === null ? null : Math.round(candle.volume),
      turnover: candle.turnover?.toFixed(4) ?? null,
      source: candle.provenance.provider,
      retrievedAt: candle.provenance.retrievedAt,
    };
  }

  /**
   * Loads stored daily history, synchronising from the provider when there is
   * not enough data. Returns ascending rows (oldest first).
   */
  async loadHistory(
    symbol: string,
    options: { minimumPoints?: number; months?: number; limit?: number } = {},
  ): Promise<{ stock: StockRow; rows: HistoricalPriceRow[]; warnings: string[]; synced: boolean }> {
    const stock = await this.ensureStock(symbol);
    const limit = options.limit ?? 400;
    const warnings: string[] = [];

    let rows = await marketRepository.historyForStock(stock.id, { limit, order: "asc" });
    const minimum = options.minimumPoints ?? 0;
    let synced = false;

    if (rows.length < minimum) {
      try {
        await this.syncDailyHistory(stock.symbol, options.months ?? 15);
        synced = true;
        rows = await marketRepository.historyForStock(stock.id, { limit, order: "asc" });
      } catch (error) {
        warnings.push(
          "Historical data could not be synchronised from NSE; stored history may be incomplete.",
        );
        logger.warn({ err: error, symbol }, "History synchronisation failed");
        if (rows.length === 0) {
          throw error;
        }
      }
    }
    return { stock, rows, warnings, synced };
  }

  async computeIndicators(symbol: string, options: { minimumPoints?: number; persist?: boolean } = {}): Promise<{
    snapshot: IndicatorSnapshot;
    stock: StockRow;
    warnings: string[];
  }> {
    const { stock, rows, warnings } = await this.loadHistory(symbol, {
      minimumPoints: options.minimumPoints ?? 60,
      months: 15,
      limit: 400,
    });

    const candles = rows.map((row) => ({
      date: row.tradingDate,
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume),
    }));

    const computed = computeIndicators(candles);
    const lastRow = rows[rows.length - 1];
    const asOfDate = lastRow?.tradingDate ?? toIstTradingDate(new Date());
    const calculatedAt = new Date();
    const snapshot: IndicatorSnapshot = {
      symbol: stock.symbol,
      asOfDate,
      calculatedAt: calculatedAt.toISOString(),
      version: INDICATOR_VERSION,
      values: computed.values,
      missing: computed.missing,
      observationsUsed: computed.observationsUsed,
    };

    if (options.persist !== false && rows.length > 0) {
      await indicatorsRepository.upsert({
        stockId: stock.id,
        symbol: stock.symbol,
        asOfDate,
        version: INDICATOR_VERSION,
        calculatedAt,
        observationsUsed: computed.observationsUsed,
        values: computed.values,
        missing: computed.missing,
        source: rows[rows.length - 1]?.source ?? this.provider.name,
      });
    }
    return { snapshot, stock, warnings };
  }

  async latestIndicators(symbol: string): Promise<{ snapshot: IndicatorSnapshot; warnings: string[] }> {
    const stock = await this.ensureStock(symbol);
    const stored = await indicatorsRepository.latest(stock.id);
    if (stored) {
      return {
        snapshot: {
          symbol: stored.symbol,
          asOfDate: stored.asOfDate,
          calculatedAt: stored.calculatedAt.toISOString(),
          version: stored.version,
          values: stored.values,
          missing: stored.missing,
          observationsUsed: stored.observationsUsed,
        },
        warnings: [],
      };
    }
    const computed = await this.computeIndicators(stock.symbol);
    return { snapshot: computed.snapshot, warnings: computed.warnings };
  }

  async requireStock(symbol: string): Promise<StockRow> {
    const stock = await stocksRepository.findBySymbol(symbol);
    if (!stock) throw new NotFoundError("Stock", symbol);
    return stock;
  }

  provenanceOfMeta(meta: ResponseMeta): Provenance {
    return {
      provider: meta.provider,
      tool: meta.tool ?? null,
      retrievedAt: new Date(meta.retrievedAt),
      observedAt: meta.observedAt ? new Date(meta.observedAt) : null,
      tradingDate: meta.tradingDate,
      delayClassification: meta.delayClassification,
    };
  }
}

export const marketDataService = new MarketDataService();
