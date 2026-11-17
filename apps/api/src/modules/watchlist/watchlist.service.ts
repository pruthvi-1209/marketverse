import type {
  AddWatchlistItemInput,
  CreateWatchlistInput,
  EntryScore,
  QualityScore,
  UpdateWatchlistInput,
  Watchlist,
  WatchlistItem,
} from "@marketverse/contracts";
import { ConflictError, NotFoundError } from "../../core/errors/app-error";
import { storedResponseMeta } from "../../core/http/response-meta";
import { logger } from "../../core/logger/logger";
import { toNumber } from "../../core/utils/numbers";
import { env } from "../../config/env";
import { getMarketDataProvider } from "../../providers";
import { marketRepository } from "../../database/repositories/market.repository";
import { stocksRepository } from "../../database/repositories/stocks.repository";
import {
  watchlistRepository,
  type WatchlistWithCount,
} from "../../database/repositories/watchlist.repository";
import { marketDataService } from "../../services/market-data.service";
import { scoringService } from "../../services/scoring.service";
import type { ResponseMeta } from "@marketverse/contracts";

function mapWatchlist(row: WatchlistWithCount, items?: WatchlistItem[]): Watchlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    itemCount: row.itemCount,
    ...(items ? { items } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class WatchlistService {
  private readonly provider = getMarketDataProvider();

  async list(): Promise<{ items: Watchlist[]; meta: ResponseMeta }> {
    const rows = await watchlistRepository.list();
    return {
      items: rows.map((row) => mapWatchlist(row)),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async get(id: string): Promise<{ watchlist: Watchlist; meta: ResponseMeta }> {
    const row = await watchlistRepository.findById(id);
    if (!row) throw new NotFoundError("Watchlist", id);

    const rawItems = await watchlistRepository.items(id);
    const symbols = rawItems.map((item) => item.symbol);
    let quotes = await marketRepository.latestQuotesForSymbols(symbols);

    // Serve live prices: the stored snapshot is written by the 5-minute background
    // job from end-of-day bulk data, so refresh stale symbols through the live quote
    // endpoint instead of leaving watchlist prices frozen at yesterday's close.
    const freshWindowMs = env.CACHE_TTL_QUOTE_SECONDS * 1000;
    const staleSymbols = symbols.filter((symbol) => {
      const row = quotes.get(symbol);
      return !row || Date.now() - row.retrievedAt.getTime() > freshWindowMs;
    });
    if (staleSymbols.length > 0) {
      const results = await Promise.allSettled(
        staleSymbols.map((symbol) => marketDataService.getQuote(symbol, { refresh: true })),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          logger.warn(
            { err: result.reason, symbol: staleSymbols[index] },
            "Live watchlist quote refresh failed; serving stored quote",
          );
        }
      });
      quotes = await marketRepository.latestQuotesForSymbols(symbols);
    }

    // Recalculate quality and entry scores from the freshest indicators and the
    // live quote we just refreshed, so scores track the market instead of waiting
    // for the nightly scoring job (JOB_SCORES_CRON runs after close).
    const scoreResults = await Promise.allSettled(
      rawItems.map((item) => scoringService.combined(item.symbol, { recalculate: true })),
    );
    const scoresBySymbol = new Map<string, { quality: QualityScore | null; entry: EntryScore | null }>();
    scoreResults.forEach((result, index) => {
      const symbol = rawItems[index]?.symbol;
      if (!symbol) return;
      if (result.status === "fulfilled") {
        scoresBySymbol.set(symbol, { quality: result.value.quality, entry: result.value.entry });
      } else {
        logger.warn(
          { err: result.reason, symbol },
          "Score recalculation failed; scores omitted for this refresh",
        );
      }
    });

    const items: WatchlistItem[] = [];
    for (const item of rawItems) {
      const quoteRow = quotes.get(item.symbol);
      const scores = scoresBySymbol.get(item.symbol);
      items.push({
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        position: item.position,
        addedAt: item.addedAt.toISOString(),
        quote: quoteRow
          ? {
              lastPrice: toNumber(quoteRow.lastPrice),
              changePercent: toNumber(quoteRow.changePercent),
              observedAt: quoteRow.observedAt.toISOString(),
            }
          : null,
        qualityScore: scores?.quality ?? null,
        entryScore: scores?.entry ?? null,
      });
    }

    return {
      watchlist: mapWatchlist(row, items),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async create(input: CreateWatchlistInput): Promise<{ watchlist: Watchlist; meta: ResponseMeta }> {
    const existing = await watchlistRepository.findByName(input.name);
    if (existing) throw new ConflictError(`A watchlist named '${input.name}' already exists`);
    const created = await watchlistRepository.create({
      name: input.name,
      description: input.description ?? null,
      isDefault: input.isDefault ?? false,
    });
    if (input.isDefault) await watchlistRepository.setDefault(created.id);
    return {
      watchlist: mapWatchlist(created),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async update(id: string, input: UpdateWatchlistInput): Promise<{ watchlist: Watchlist; meta: ResponseMeta }> {
    const existing = await watchlistRepository.findById(id);
    if (!existing) throw new NotFoundError("Watchlist", id);
    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await watchlistRepository.findByName(input.name);
      if (duplicate) throw new ConflictError(`A watchlist named '${input.name}' already exists`);
    }
    const updated = await watchlistRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
    return {
      watchlist: mapWatchlist({ ...updated, itemCount: existing.itemCount }),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async delete(id: string): Promise<void> {
    const existing = await watchlistRepository.findById(id);
    if (!existing) throw new NotFoundError("Watchlist", id);
    if (existing.isDefault) {
      throw new ConflictError("The default watchlist cannot be deleted; rename or replace it instead");
    }
    await watchlistRepository.remove(id);
  }

  async addStock(
    id: string,
    input: AddWatchlistItemInput,
  ): Promise<{ item: WatchlistItem; meta: ResponseMeta }> {
    const watchlist = await watchlistRepository.findById(id);
    if (!watchlist) throw new NotFoundError("Watchlist", id);

    const symbol = input.symbol.toUpperCase();
    const duplicate = await watchlistRepository.findItem(id, symbol);
    if (duplicate) throw new ConflictError(`${symbol} is already in this watchlist`);

    const stock = await this.resolveStock(symbol);
    const created = await watchlistRepository.addItem({
      watchlistId: id,
      stockId: stock.id,
      symbol: stock.symbol,
      position: input.position,
    });

    return {
      item: {
        id: created.id,
        symbol: stock.symbol,
        name: stock.name,
        position: input.position ?? watchlist.itemCount,
        addedAt: new Date().toISOString(),
        quote: null,
        qualityScore: null,
        entryScore: null,
      },
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  private async resolveStock(symbol: string) {
    const existing = await stocksRepository.findBySymbol(symbol);
    if (existing) return existing;

    // Validate the symbol against authoritative provider data before creating it.
    try {
      const quotes = await this.provider.getQuotes([symbol]);
      const match = quotes.find((quote) => quote.symbol === symbol);
      if (match) {
        return marketDataService.ensureStock(symbol);
      }
    } catch {
      // fall through to the explicit not-found error
    }
    throw new NotFoundError("NSE stock", symbol);
  }

  async removeStock(id: string, symbol: string): Promise<{ meta: ResponseMeta }> {
    const watchlist = await watchlistRepository.findById(id);
    if (!watchlist) throw new NotFoundError("Watchlist", id);
    const removed = await watchlistRepository.removeItem(id, symbol.toUpperCase());
    if (!removed) throw new NotFoundError("Watchlist item", symbol);
    return { meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async reorder(id: string, symbols: string[]): Promise<{ watchlist: Watchlist; meta: ResponseMeta }> {
    const watchlist = await watchlistRepository.findById(id);
    if (!watchlist) throw new NotFoundError("Watchlist", id);
    await watchlistRepository.reorder(id, symbols.map((symbol) => symbol.toUpperCase()));
    return this.get(id);
  }

  async scores(
    id: string,
    symbol: string,
  ): Promise<{ quality: QualityScore | null; entry: EntryScore | null; meta: ResponseMeta }> {
    const watchlist = await watchlistRepository.findById(id);
    if (!watchlist) throw new NotFoundError("Watchlist", id);
    const item = await watchlistRepository.findItem(id, symbol.toUpperCase());
    if (!item) throw new NotFoundError("Watchlist item", symbol);
    const combined = await scoringService.combined(item.symbol, { recalculate: true });
    return {
      quality: combined.quality,
      entry: combined.entry,
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async ensureDefaultWatchlist(): Promise<void> {
    const existing = await watchlistRepository.findByName("AI Infrastructure");
    if (existing) return;
    const created = await watchlistRepository.create({
      name: "AI Infrastructure",
      description:
        "Default research watchlist for Indian companies with power, cooling, networking or data-centre exposure. " +
        "Inclusion is not a recommendation and does not imply AI revenue.",
      isDefault: true,
    });
    await watchlistRepository.setDefault(created.id);
  }
}

export const watchlistService = new WatchlistService();
