import type { HistoricalPrice, Performance, Quote } from "@marketverse/contracts";
import { percentChange, toNumber } from "../../core/utils/numbers";
import type { HistoricalPriceRow, MarketQuoteRow } from "../../database/schema";

export function mapQuoteRow(row: MarketQuoteRow): Quote {
  return {
    symbol: row.symbol,
    name: null,
    lastPrice: toNumber(row.lastPrice),
    change: toNumber(row.changeValue),
    changePercent: toNumber(row.changePercent),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    previousClose: toNumber(row.previousClose),
    volume: toNumber(row.volume),
    turnover: toNumber(row.turnover),
    yearHigh: toNumber(row.yearHigh),
    yearLow: toNumber(row.yearLow),
    observedAt: row.observedAt.toISOString(),
    tradingDate: row.tradingDate,
  };
}

export function mapHistoryRow(row: HistoricalPriceRow): HistoricalPrice {
  return {
    date: row.tradingDate,
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    volume: toNumber(row.volume),
    turnover: toNumber(row.turnover),
    source: row.source,
  };
}

/** Period returns from ascending daily history. Missing periods return null. */
export function computePerformance(rowsAscending: HistoricalPriceRow[]): Performance {
  const closes = rowsAscending
    .map((row) => toNumber(row.close))
    .filter((value): value is number => value !== null);

  const at = (periodsBack: number): number | null => {
    if (closes.length <= periodsBack) return null;
    return closes[closes.length - 1 - periodsBack] ?? null;
  };
  const latest = closes[closes.length - 1] ?? null;
  const change = (periods: number): number | null => percentChange(latest, at(periods));

  const lastRow = rowsAscending[rowsAscending.length - 1];
  let ytd: number | null = null;
  if (lastRow && latest !== null) {
    const year = lastRow.tradingDate.slice(0, 4);
    const first = rowsAscending.find((row) => row.tradingDate.startsWith(`${year}-`));
    ytd = first ? percentChange(latest, toNumber(first.close)) : null;
  }

  return {
    oneDayPercent: change(1),
    oneWeekPercent: change(5),
    oneMonthPercent: change(21),
    threeMonthPercent: change(63),
    sixMonthPercent: change(126),
    oneYearPercent: change(252),
    yearToDatePercent: ytd,
  };
}
