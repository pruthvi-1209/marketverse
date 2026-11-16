import { env } from "../config/env";
import { alertRepository } from "../database/repositories/alerts.repository";
import { portfolioRepository } from "../database/repositories/portfolio.repository";
import { watchlistRepository } from "../database/repositories/watchlist.repository";

/**
 * Every symbol MarketVerse should keep warm: the configured AI-infrastructure
 * list, watchlist contents, alert targets and portfolio positions. Deleted
 * watchlists and sold-out positions naturally drop out of this set.
 */
export async function trackedSymbols(): Promise<string[]> {
  const symbols = new Set<string>();

  for (const symbol of env.AI_INFRA_WATCHLIST_SYMBOLS) {
    symbols.add(symbol.trim().toUpperCase());
  }

  const watchlists = await watchlistRepository.list();
  for (const watchlist of watchlists) {
    const items = await watchlistRepository.items(watchlist.id);
    for (const item of items) symbols.add(item.symbol.toUpperCase());
  }

  const alerts = await alertRepository.list();
  for (const alert of alerts) {
    if (alert.symbol) symbols.add(alert.symbol.toUpperCase());
    if (alert.watchlistId) {
      const items = await watchlistRepository.items(alert.watchlistId);
      for (const item of items) symbols.add(item.symbol.toUpperCase());
    }
  }

  const accounts = await portfolioRepository.listAccounts();
  for (const account of accounts) {
    const transactions = await portfolioRepository.transactions(account.id);
    for (const transaction of transactions) symbols.add(transaction.symbol.toUpperCase());
  }

  return [...symbols].filter((symbol) => symbol.length > 0).sort();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
