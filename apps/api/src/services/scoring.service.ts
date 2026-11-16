import { env } from "../config/env";
import { logger } from "../core/logger/logger";
import { toNumber } from "../core/utils/numbers";
import type { CombinedScores, EntryScore, QualityScore } from "@marketverse/contracts";
import { SCORE_DISCLAIMER } from "@marketverse/contracts";
import { marketRepository } from "../database/repositories/market.repository";
import { researchRepository } from "../database/repositories/research.repository";
import { scoringRepository, mapEntryRow, mapQualityRow } from "../database/repositories/scoring.repository";
import { NotFoundError } from "../core/errors/app-error";
import { computeQualityScore, type FundamentalInputs } from "../modules/scoring/quality-scorer";
import { computeEntryScore, type BenchmarkReturns } from "../modules/scoring/entry-scorer";
import { marketDataService } from "./market-data.service";
import { toIstTradingDate } from "../core/utils/time";

async function benchmarkReturns(): Promise<BenchmarkReturns | null> {
  const symbol = env.BENCHMARK_INDEX_SYMBOL;
  const rows = await marketRepository.indexHistoryForSymbol(symbol, 300);
  if (rows.length < 2) return null;
  const ascending = [...rows].reverse();
  const closes = ascending
    .map((row) => toNumber(row.close))
    .filter((value): value is number => value !== null);
  if (closes.length < 2) return null;

  const pct = (periods: number): number | null => {
    if (closes.length <= periods) return null;
    const latest = closes[closes.length - 1];
    const reference = closes[closes.length - 1 - periods];
    if (latest === undefined || reference === undefined || reference === 0) return null;
    return ((latest - reference) / Math.abs(reference)) * 100;
  };

  return {
    symbol,
    threeMonthPercent: pct(63),
    oneYearPercent: pct(252),
  };
}

export class ScoringService {
  async quality(symbol: string, options: { recalculate?: boolean } = {}): Promise<QualityScore> {
    const stock = await marketDataService.requireStock(symbol);
    if (!options.recalculate) {
      const stored = await scoringRepository.latestQuality(stock.id);
      if (stored) return mapQualityRow(stored);
    }
    return this.recalculateQuality(symbol);
  }

  async recalculateQuality(symbol: string): Promise<QualityScore> {
    const { stock, snapshot } = await marketDataService.computeIndicators(symbol, { persist: true });
    const quote = await marketRepository.latestQuote(stock.id);
    const latestClose = quote ? toNumber(quote.lastPrice) : null;

    const fundamentals = await this.buildFundamentalInputs(stock.id);
    const score = computeQualityScore({
      symbol: stock.symbol,
      indicators: snapshot.values,
      latestClose,
      fundamentals,
      calculatedAt: new Date(),
    });

    await scoringRepository.saveQuality({
      stockId: stock.id,
      symbol: stock.symbol,
      asOfDate: snapshot.asOfDate,
      score: score.score,
      availablePoints: score.availablePoints,
      coveragePercent: score.coveragePercent,
      categories: score.categories,
      missingFields: score.missingFields,
      explanation: score.explanation,
      methodologyVersion: score.methodologyVersion,
      calculatedAt: new Date(score.calculatedAt),
    });
    return score;
  }

  async entry(symbol: string, options: { recalculate?: boolean } = {}): Promise<EntryScore> {
    const stock = await marketDataService.requireStock(symbol);
    if (!options.recalculate) {
      const stored = await scoringRepository.latestEntry(stock.id);
      if (stored) return mapEntryRow(stored);
    }
    return this.recalculateEntry(symbol);
  }

  async recalculateEntry(symbol: string): Promise<EntryScore> {
    const { stock, snapshot } = await marketDataService.computeIndicators(symbol, { persist: true });
    const quote = await marketRepository.latestQuote(stock.id);
    const latestClose = quote ? toNumber(quote.lastPrice) : null;
    const benchmark = await benchmarkReturns();

    const score = computeEntryScore({
      symbol: stock.symbol,
      indicators: snapshot.values,
      latestClose,
      benchmark,
      calculatedAt: new Date(),
    });

    await scoringRepository.saveEntry({
      stockId: stock.id,
      symbol: stock.symbol,
      asOfDate: snapshot.asOfDate,
      score: score.score,
      coveragePercent: score.coveragePercent,
      components: score.components,
      riskFactors: score.riskFactors,
      invalidationLevel: score.invalidationLevel,
      explanation: score.explanation,
      methodologyVersion: score.methodologyVersion,
      calculatedAt: new Date(score.calculatedAt),
    });
    return score;
  }

  async combined(symbol: string, options: { recalculate?: boolean } = {}): Promise<CombinedScores> {
    const stock = await marketDataService.requireStock(symbol);
    const [qualityRow, entryRow] = await Promise.all([
      scoringRepository.latestQuality(stock.id),
      scoringRepository.latestEntry(stock.id),
    ]);

    let quality = qualityRow ? mapQualityRow(qualityRow) : null;
    let entry = entryRow ? mapEntryRow(entryRow) : null;

    if (options.recalculate || !quality) {
      quality = await this.recalculateQuality(symbol).catch((error) => {
        logger.warn({ err: error, symbol }, "Quality recalculation failed");
        return null;
      });
    }
    if (options.recalculate || !entry) {
      entry = await this.recalculateEntry(symbol).catch((error) => {
        logger.warn({ err: error, symbol }, "Entry recalculation failed");
        return null;
      });
    }

    return {
      symbol: stock.symbol,
      quality,
      entry,
      disclaimer: SCORE_DISCLAIMER,
    };
  }

  async recalculateAll(): Promise<{ processed: number; failed: number }> {
    const { rows } = await (await import("../database/repositories/stocks.repository")).stocksRepository.list({
      page: 1,
      pageSize: 500,
      sortBy: "symbol",
      sortOrder: "asc",
    });
    let processed = 0;
    let failed = 0;
    for (const stock of rows) {
      try {
        await this.recalculateQuality(stock.symbol);
        await this.recalculateEntry(stock.symbol);
        processed += 1;
      } catch (error) {
        failed += 1;
        logger.warn({ err: error, symbol: stock.symbol }, "Score recalculation failed for stock");
      }
    }
    return { processed, failed };
  }

  private async buildFundamentalInputs(stockId: string): Promise<FundamentalInputs | null> {
    const latest = await researchRepository.latestVerifiedFundamental(stockId);
    if (!latest) return null;
    const prior = await researchRepository.priorVerifiedFundamental(stockId, latest.periodEnd);

    const growth = (current: string | null, previous: string | null): number | null => {
      const currentValue = toNumber(current);
      const previousValue = toNumber(previous);
      if (currentValue === null || previousValue === null || previousValue === 0) return null;
      return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    };

    return {
      revenueGrowthPercent: prior ? growth(latest.revenue, prior.revenue) : null,
      netProfitGrowthPercent: prior ? growth(latest.netProfit, prior.netProfit) : null,
      epsGrowthPercent: prior ? growth(latest.eps, prior.eps) : null,
      roePercent: toNumber(latest.roePercent),
      operatingMarginPercent: toNumber(latest.operatingMarginPercent),
      debtToEquity: toNumber(latest.debtToEquity),
      promoterHoldingPercent: toNumber(latest.promoterHoldingPercent),
      institutionalHoldingPercent: toNumber(latest.institutionalHoldingPercent),
      periodLabel: `${latest.periodType} ${latest.periodEnd}`,
    };
  }

  async history(symbol: string, limit = 30): Promise<{ quality: QualityScore[]; entry: EntryScore[] }> {
    const stock = await marketDataService.requireStock(symbol);
    const [qualityRows, entryRows] = await Promise.all([
      scoringRepository.qualityHistory(stock.id, limit),
      scoringRepository.entryHistory(stock.id, limit),
    ]);
    return {
      quality: qualityRows.map(mapQualityRow),
      entry: entryRows.map(mapEntryRow),
    };
  }

  async scoreForToday(symbol: string): Promise<{ asOfDate: string }> {
    const stock = await marketDataService.requireStock(symbol);
    if (!stock) throw new NotFoundError("Stock", symbol);
    return { asOfDate: toIstTradingDate(new Date()) };
  }
}

export const scoringService = new ScoringService();
