import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../client";
import {
  historicalPrices,
  indexHistory,
  indexQuotes,
  marketIndices,
  marketQuotes,
  type HistoricalPriceRow,
  type IndexQuoteRow,
  type MarketQuoteRow,
  type NewHistoricalPrice,
  type NewMarketQuote,
} from "../schema";

export interface QuoteInsert {
  values: NewMarketQuote;
  raw?: Record<string, unknown> | null;
}

export const marketRepository = {
  /** Idempotent: identical observations are ignored, never overwritten. */
  async insertQuotes(quotes: QuoteInsert[]): Promise<number> {
    if (quotes.length === 0) return 0;
    const inserted = await db
      .insert(marketQuotes)
      .values(quotes.map((quote) => ({ ...quote.values, rawPayload: quote.raw ?? null })))
      .onConflictDoNothing({
        target: [marketQuotes.stockId, marketQuotes.tradingDate, marketQuotes.observedAt, marketQuotes.source],
      })
      .returning({ id: marketQuotes.id });
    return inserted.length;
  },

  async insertHistory(rows: NewHistoricalPrice[]): Promise<number> {
    if (rows.length === 0) return 0;
    // Chunk to stay well below PostgreSQL parameter limits.
    let inserted = 0;
    for (let index = 0; index < rows.length; index += 500) {
      const chunk = rows.slice(index, index + 500);
      const result = await db
        .insert(historicalPrices)
        .values(chunk)
        .onConflictDoNothing({
          target: [historicalPrices.stockId, historicalPrices.tradingDate, historicalPrices.source],
        })
        .returning({ id: historicalPrices.id });
      inserted += result.length;
    }
    return inserted;
  },

  async latestQuote(stockId: string): Promise<MarketQuoteRow | null> {
    const rows = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.stockId, stockId))
      .orderBy(desc(marketQuotes.observedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async latestQuotesForSymbols(symbols: string[]): Promise<Map<string, MarketQuoteRow>> {
    const result = new Map<string, MarketQuoteRow>();
    if (symbols.length === 0) return result;
    const rows = await db
      .select()
      .from(marketQuotes)
      .where(inArray(marketQuotes.symbol, symbols))
      .orderBy(desc(marketQuotes.observedAt));
    for (const row of rows) {
      if (!result.has(row.symbol)) result.set(row.symbol, row);
    }
    return result;
  },

  async historyForStock(
    stockId: string,
    options: { from?: string; to?: string; limit: number; order: "asc" | "desc" },
  ): Promise<HistoricalPriceRow[]> {
    const conditions = [eq(historicalPrices.stockId, stockId)];
    if (options.from) conditions.push(gte(historicalPrices.tradingDate, options.from));
    if (options.to) conditions.push(lte(historicalPrices.tradingDate, options.to));
    return db
      .select()
      .from(historicalPrices)
      .where(and(...conditions))
      .orderBy(
        options.order === "asc"
          ? asc(historicalPrices.tradingDate)
          : desc(historicalPrices.tradingDate),
      )
      .limit(options.limit);
  },

  async newestHistoryDate(stockId: string | null, source?: string): Promise<string | null> {
    const conditions = [];
    if (stockId) conditions.push(eq(historicalPrices.stockId, stockId));
    if (source) conditions.push(eq(historicalPrices.source, source));
    const rows = await db
      .select({ tradingDate: historicalPrices.tradingDate })
      .from(historicalPrices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(historicalPrices.tradingDate))
      .limit(1);
    return rows[0]?.tradingDate ?? null;
  },

  async historyCount(): Promise<number> {
    const rows = await db.select({ value: count() }).from(historicalPrices);
    return Number(rows[0]?.value ?? 0);
  },

  async quoteCount(): Promise<number> {
    const rows = await db.select({ value: count() }).from(marketQuotes);
    return Number(rows[0]?.value ?? 0);
  },

  async newestQuoteObservedAt(): Promise<Date | null> {
    const rows = await db
      .select({ observedAt: marketQuotes.observedAt })
      .from(marketQuotes)
      .orderBy(desc(marketQuotes.observedAt))
      .limit(1);
    return rows[0]?.observedAt ?? null;
  },

  async upsertIndex(input: {
    symbol: string;
    name: string;
    exchangeId: string | null;
    exchangeCode?: string;
    isBenchmark?: boolean;
  }): Promise<string> {
    const rows = await db
      .insert(marketIndices)
      .values({
        symbol: input.symbol,
        name: input.name,
        exchangeId: input.exchangeId,
        exchangeCode: input.exchangeCode ?? "NSE",
        isBenchmark: input.isBenchmark ?? false,
      })
      .onConflictDoUpdate({
        target: marketIndices.symbol,
        set: { name: input.name, updatedAt: new Date() },
      })
      .returning({ id: marketIndices.id });
    const row = rows[0];
    if (!row) throw new Error("Failed to upsert market index");
    return row.id;
  },

  async insertIndexQuote(values: typeof indexQuotes.$inferInsert): Promise<void> {
    await db
      .insert(indexQuotes)
      .values(values)
      .onConflictDoNothing({
        target: [indexQuotes.indexId, indexQuotes.observedAt, indexQuotes.source],
      });
  },

  async insertIndexHistory(rows: Array<typeof indexHistory.$inferInsert>): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(indexHistory)
      .values(rows)
      .onConflictDoNothing({
        target: [indexHistory.indexId, indexHistory.tradingDate, indexHistory.source],
      })
      .returning({ id: indexHistory.id });
    return inserted.length;
  },

  async latestIndexQuotes(symbols: string[]): Promise<IndexQuoteRow[]> {
    if (symbols.length === 0) return [];
    const rows = await db
      .select()
      .from(indexQuotes)
      .where(inArray(indexQuotes.symbol, symbols))
      .orderBy(desc(indexQuotes.observedAt));
    const seen = new Set<string>();
    const latest: IndexQuoteRow[] = [];
    for (const row of rows) {
      if (seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      latest.push(row);
    }
    return latest;
  },

  async indexHistoryForSymbol(symbol: string, limit: number): Promise<Array<typeof indexHistory.$inferSelect>> {
    const rows = await db
      .select()
      .from(indexHistory)
      .where(eq(indexHistory.symbol, symbol))
      .orderBy(desc(indexHistory.tradingDate))
      .limit(limit);
    return rows;
  },

  async indexSymbols(): Promise<string[]> {
    const rows = await db.select({ symbol: marketIndices.symbol }).from(marketIndices).orderBy(asc(marketIndices.symbol));
    return rows.map((row) => row.symbol);
  },

  async indexHistoryCount(): Promise<number> {
    const rows = await db.select({ value: count() }).from(indexHistory);
    return Number(rows[0]?.value ?? 0);
  },

  async deleteOldQuotes(olderThan: Date): Promise<number> {
    const result = await db
      .delete(marketQuotes)
      .where(sql`${marketQuotes.observedAt} < ${olderThan}`)
      .returning({ id: marketQuotes.id });
    return result.length;
  },
};

export type { MarketQuoteRow, HistoricalPriceRow, IndexQuoteRow };
