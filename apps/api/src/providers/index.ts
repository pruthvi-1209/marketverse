import { NseMarketDataProvider } from "./nse/nse-market-data-provider";
import type { MarketDataProvider } from "./types";

let singleton: NseMarketDataProvider | null = null;

/**
 * Business modules receive this interface, never the NSE implementation
 * directly, so another legitimate provider can be added without rewriting the
 * analysis engine.
 */
export function getMarketDataProvider(): MarketDataProvider {
  singleton ??= new NseMarketDataProvider();
  return singleton;
}

export function getNseProvider(): NseMarketDataProvider {
  singleton ??= new NseMarketDataProvider();
  return singleton;
}

export function resetMarketDataProvider(): void {
  singleton = null;
}

export * from "./types";
