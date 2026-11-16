import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { stocks, watchlistItems, watchlists } from "../schema";

export interface WatchlistWithCount {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
}

export const watchlistRepository = {
  async list(): Promise<WatchlistWithCount[]> {
    const rows = await db
      .select({
        id: watchlists.id,
        name: watchlists.name,
        description: watchlists.description,
        isDefault: watchlists.isDefault,
        createdAt: watchlists.createdAt,
        updatedAt: watchlists.updatedAt,
        itemCount: count(watchlistItems.id),
      })
      .from(watchlists)
      .leftJoin(watchlistItems, eq(watchlistItems.watchlistId, watchlists.id))
      .groupBy(watchlists.id)
      .orderBy(asc(watchlists.createdAt));
    return rows.map((row) => ({ ...row, itemCount: Number(row.itemCount) }));
  },

  async findById(id: string): Promise<WatchlistWithCount | null> {
    const rows = await db
      .select({
        id: watchlists.id,
        name: watchlists.name,
        description: watchlists.description,
        isDefault: watchlists.isDefault,
        createdAt: watchlists.createdAt,
        updatedAt: watchlists.updatedAt,
        itemCount: count(watchlistItems.id),
      })
      .from(watchlists)
      .leftJoin(watchlistItems, eq(watchlistItems.watchlistId, watchlists.id))
      .where(eq(watchlists.id, id))
      .groupBy(watchlists.id)
      .limit(1);
    const row = rows[0];
    return row ? { ...row, itemCount: Number(row.itemCount) } : null;
  },

  async findByName(name: string): Promise<WatchlistWithCount | null> {
    const rows = await db
      .select({
        id: watchlists.id,
        name: watchlists.name,
        description: watchlists.description,
        isDefault: watchlists.isDefault,
        createdAt: watchlists.createdAt,
        updatedAt: watchlists.updatedAt,
        itemCount: count(watchlistItems.id),
      })
      .from(watchlists)
      .leftJoin(watchlistItems, eq(watchlistItems.watchlistId, watchlists.id))
      .where(sql`lower(${watchlists.name}) = lower(${name})`)
      .groupBy(watchlists.id)
      .limit(1);
    const row = rows[0];
    return row ? { ...row, itemCount: Number(row.itemCount) } : null;
  },

  async create(input: { name: string; description?: string | null; isDefault?: boolean }): Promise<WatchlistWithCount> {
    const rows = await db
      .insert(watchlists)
      .values({
        name: input.name,
        description: input.description ?? null,
        isDefault: input.isDefault ?? false,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to create watchlist");
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      itemCount: 0,
    };
  },

  async update(
    id: string,
    input: { name?: string; description?: string | null },
  ): Promise<WatchlistWithCount> {
    const rows = await db
      .update(watchlists)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(watchlists.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Watchlist not found while updating");
    return { ...row, itemCount: 0 };
  },

  async remove(id: string): Promise<void> {
    await db.delete(watchlists).where(eq(watchlists.id, id));
  },

  async items(watchlistId: string): Promise<
    Array<{
      id: string;
      symbol: string;
      name: string | null;
      position: number;
      addedAt: Date;
      stockId: string;
    }>
  > {
    return db
      .select({
        id: watchlistItems.id,
        symbol: watchlistItems.symbol,
        name: stocks.name,
        position: watchlistItems.position,
        addedAt: watchlistItems.addedAt,
        stockId: watchlistItems.stockId,
      })
      .from(watchlistItems)
      .leftJoin(stocks, eq(stocks.id, watchlistItems.stockId))
      .where(eq(watchlistItems.watchlistId, watchlistId))
      .orderBy(asc(watchlistItems.position), asc(watchlistItems.symbol));
  },

  async findItem(watchlistId: string, symbol: string): Promise<{ id: string; stockId: string } | null> {
    const rows = await db
      .select({ id: watchlistItems.id, stockId: watchlistItems.stockId })
      .from(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.symbol, symbol)))
      .limit(1);
    return rows[0] ?? null;
  },

  async addItem(input: {
    watchlistId: string;
    stockId: string;
    symbol: string;
    position?: number;
  }): Promise<{ id: string }> {
    const position =
      input.position ??
      ((
        await db
          .select({ max: sql<number>`coalesce(max(${watchlistItems.position}), -1)` })
          .from(watchlistItems)
          .where(eq(watchlistItems.watchlistId, input.watchlistId))
      )[0]?.max ?? -1) + 1;

    const rows = await db
      .insert(watchlistItems)
      .values({
        watchlistId: input.watchlistId,
        stockId: input.stockId,
        symbol: input.symbol,
        position,
      })
      .returning({ id: watchlistItems.id });
    const row = rows[0];
    if (!row) throw new Error("Failed to add watchlist item");
    return row;
  },

  async removeItem(watchlistId: string, symbol: string): Promise<boolean> {
    const rows = await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.symbol, symbol)))
      .returning({ id: watchlistItems.id });
    return rows.length > 0;
  },

  async reorder(watchlistId: string, symbols: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let index = 0; index < symbols.length; index += 1) {
        const symbol = symbols[index];
        if (!symbol) continue;
        await tx
          .update(watchlistItems)
          .set({ position: index })
          .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.symbol, symbol)));
      }
    });
  },

  async setDefault(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(watchlists).set({ isDefault: false }).where(eq(watchlists.isDefault, true));
      await tx.update(watchlists).set({ isDefault: true }).where(eq(watchlists.id, id));
    });
  },

  async count(): Promise<number> {
    const rows = await db.select({ value: count() }).from(watchlists);
    return Number(rows[0]?.value ?? 0);
  },
};
