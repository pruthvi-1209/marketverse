import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Stock } from "@marketverse/contracts";
import { db } from "../client";
import { stocks, type NewStock, type Stock as StockRow } from "../schema";
import type { StockListQuery } from "@marketverse/contracts";

export function mapStockRow(row: StockRow & { exchangeCode?: string | null }): Stock {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    isin: row.isin,
    exchangeCode: row.exchangeCode ?? "NSE",
    sector: row.sector,
    industry: row.industry,
    listingStatus: row.listingStatus,
    instrumentType: row.instrumentType,
    dataSource: row.dataSource,
    lastUpdatedAt: row.lastUpdatedAt ? row.lastUpdatedAt.toISOString() : null,
  };
}

export const stocksRepository = {
  async findBySymbol(symbol: string): Promise<StockRow | null> {
    const rows = await db
      .select()
      .from(stocks)
      .where(eq(stocks.symbol, symbol.trim().toUpperCase()))
      .limit(1);
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<StockRow | null> {
    const rows = await db.select().from(stocks).where(eq(stocks.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async findByIds(ids: string[]): Promise<StockRow[]> {
    if (ids.length === 0) return [];
    return db.select().from(stocks).where(inArray(stocks.id, ids));
  },

  async list(query: StockListQuery): Promise<{ rows: StockRow[]; total: number }> {
    const conditions = [];
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(or(ilike(stocks.symbol, term), ilike(stocks.name, term)));
    }
    if (query.sector) conditions.push(eq(stocks.sector, query.sector));
    if (query.listingStatus) conditions.push(eq(stocks.listingStatus, query.listingStatus));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn =
      query.sortBy === "name" ? stocks.name : query.sortBy === "lastUpdatedAt" ? stocks.lastUpdatedAt : stocks.symbol;
    const orderBy = query.sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

    const rows = await db
      .select()
      .from(stocks)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const totalRows = await db.select({ value: count() }).from(stocks).where(where);
    return { rows, total: Number(totalRows[0]?.value ?? 0) };
  },

  async upsert(input: NewStock): Promise<StockRow> {
    const rows = await db
      .insert(stocks)
      .values({ ...input, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: stocks.symbol,
        set: {
          name: input.name ?? null,
          isin: input.isin ?? null,
          exchangeId: input.exchangeId,
          sector: input.sector ?? null,
          industry: input.industry ?? null,
          listingStatus: input.listingStatus ?? "unknown",
          instrumentType: input.instrumentType ?? null,
          dataSource: input.dataSource ?? "nse",
          sourceUpdatedAt: input.sourceUpdatedAt ?? null,
          lastUpdatedAt: input.lastUpdatedAt ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to upsert stock");
    return row;
  },

  async upsertMany(inputs: NewStock[]): Promise<StockRow[]> {
    if (inputs.length === 0) return [];
    const rows = await db
      .insert(stocks)
      .values(inputs)
      .onConflictDoUpdate({
        target: stocks.symbol,
        set: {
          name: sql`excluded.name`,
          sector: sql`excluded.sector`,
          industry: sql`excluded.industry`,
          lastUpdatedAt: sql`excluded.last_updated_at`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows;
  },

  async touchUpdatedAt(symbol: string, when: Date): Promise<void> {
    await db
      .update(stocks)
      .set({ lastUpdatedAt: when, updatedAt: new Date() })
      .where(eq(stocks.symbol, symbol));
  },

  async count(): Promise<number> {
    const rows = await db.select({ value: count() }).from(stocks);
    return Number(rows[0]?.value ?? 0);
  },
};
