import { eq, sql } from "drizzle-orm";
import type { AiRelevance } from "@marketverse/contracts";
import { env } from "../config/env";
import { logger } from "../core/logger/logger";
import { closeDatabase, db } from "./client";
import {
  aiInfrastructureCompanies,
  dataSources,
  exchanges,
  marketIndices,
  stocks,
  watchlistItems,
  watchlists,
} from "./schema";

/**
 * Idempotent reference seed. It creates only things MarketVerse actually knows:
 * exchange/source registry rows, index reference metadata and the configured
 * AI-infrastructure watchlist. It never inserts prices, quotes, fundamentals or
 * news because those must come from a real observation.
 */

const INTERPRETATION_DISCLAIMER =
  "Exposure descriptions are MarketVerse research interpretation, not NSE-sourced facts. " +
  "Inclusion in this list is not a recommendation and does not mean the company earns AI-related revenue.";

function emptyRelevance(): AiRelevance {
  return {
    businessSummary: null,
    aiInfrastructureRelevance:
      "Configured AI-infrastructure research watchlist member. Sourced exposure notes are not recorded yet.",
    powerInfrastructureExposure: null,
    dataCenterExposure: null,
    coolingThermalExposure: null,
    networkingConnectivityExposure: null,
    orderBookNotes: null,
    majorRisks: [],
    interpretationDisclaimer: INTERPRETATION_DISCLAIMER,
  };
}

const DATA_SOURCES = [
  {
    key: "nse-bhavcopy-mcp",
    name: "NSE Bhavcopy MCP server",
    kind: "mcp" as const,
    baseUrl: env.NSE_BHAVCOPY_MCP_URL,
    termsNotes:
      "Official NSE public MCP endpoint, no authentication. Daily bhavcopy data is end-of-day; " +
      "never presented as a real-time feed.",
    metadata: { server: "bhavcopy", transport: "streamable-http" },
  },
  {
    key: "nse-cm-market-mcp",
    name: "NSE Capital Market MCP server",
    kind: "mcp" as const,
    baseUrl: env.NSE_MARKET_MCP_URL,
    termsNotes:
      "Official NSE public MCP endpoint, no authentication. Quote responses may be delayed by " +
      "one to three minutes; delay classification is stored per observation.",
    metadata: { server: "cmmkt", transport: "streamable-http" },
  },
  {
    key: "marketverse-derived",
    name: "MarketVerse derived analytics",
    kind: "derived" as const,
    termsNotes: "Indicators, scores and portfolio analytics computed from stored observations.",
    metadata: { methodologyVersion: "1.0.0" },
  },
  {
    key: "manual-research",
    name: "Manual research entry",
    kind: "manual" as const,
    termsNotes:
      "Operator-supplied research notes and manual news imports. Callers are responsible for " +
      "data rights. Manual entries are clearly separated from sourced observations.",
    metadata: {},
  },
];

const INDICES = [
  { symbol: "NIFTY 50", name: "NIFTY 50", isBenchmark: true },
  { symbol: "NIFTY BANK", name: "NIFTY BANK", isBenchmark: false },
  { symbol: "NIFTY IT", name: "NIFTY IT", isBenchmark: false },
  { symbol: "NIFTY NEXT 50", name: "NIFTY NEXT 50", isBenchmark: false },
  { symbol: "NIFTY MIDCAP 100", name: "NIFTY MIDCAP 100", isBenchmark: false },
  { symbol: "NIFTY SMALLCAP 100", name: "NIFTY SMALLCAP 100", isBenchmark: false },
  { symbol: "INDIA VIX", name: "India VIX", isBenchmark: false },
];

async function seed(): Promise<void> {
  const summary = await db.transaction(async (tx) => {
    const nseRows = await tx
      .insert(exchanges)
      .values({
        code: "NSE",
        name: "National Stock Exchange of India",
        mic: "XNSE",
        country: "IN",
        timezone: "Asia/Kolkata",
      })
      .onConflictDoUpdate({
        target: exchanges.code,
        set: {
          name: "National Stock Exchange of India",
          mic: "XNSE",
          timezone: "Asia/Kolkata",
          updatedAt: new Date(),
        },
      })
      .returning({ id: exchanges.id });
    const nseId = nseRows[0]?.id;
    if (!nseId) throw new Error("Failed to seed the NSE exchange row");

    for (const source of DATA_SOURCES) {
      await tx
        .insert(dataSources)
        .values({
          key: source.key,
          name: source.name,
          kind: source.kind,
          baseUrl: "baseUrl" in source ? source.baseUrl : null,
          enabled: true,
          termsNotes: source.termsNotes,
          metadata: source.metadata,
        })
        .onConflictDoUpdate({
          target: dataSources.key,
          set: {
            name: source.name,
            kind: source.kind,
            baseUrl: "baseUrl" in source ? source.baseUrl : null,
            termsNotes: source.termsNotes,
            metadata: source.metadata,
            updatedAt: new Date(),
          },
        });
    }

    for (const index of INDICES) {
      await tx
        .insert(marketIndices)
        .values({
          symbol: index.symbol,
          name: index.name,
          exchangeId: nseId,
          exchangeCode: "NSE",
          isBenchmark: index.symbol === env.BENCHMARK_INDEX_SYMBOL || index.isBenchmark,
        })
        .onConflictDoUpdate({
          target: marketIndices.symbol,
          set: {
            name: index.name,
            exchangeId: nseId,
            exchangeCode: "NSE",
            isBenchmark: index.symbol === env.BENCHMARK_INDEX_SYMBOL || index.isBenchmark,
            updatedAt: new Date(),
          },
        });
    }

    const watchlistRows = await tx
      .insert(watchlists)
      .values({
        name: "AI Infrastructure",
        description:
          "Configurable research watchlist for Indian AI-infrastructure exposure. " +
          "Interpretation only, not a recommendation.",
        isDefault: true,
      })
      .onConflictDoNothing()
      .returning({ id: watchlists.id });
    let watchlistId = watchlistRows[0]?.id;
    if (!watchlistId) {
      const existing = await tx
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(sql`lower(${watchlists.name}) = ${"ai infrastructure"}`)
        .limit(1);
      watchlistId = existing[0]?.id;
    }
    if (!watchlistId) throw new Error("Failed to seed the AI Infrastructure watchlist");

    const symbols = [...new Set(env.AI_INFRA_WATCHLIST_SYMBOLS.map((s) => s.trim().toUpperCase()))];
    let stocksCreated = 0;
    let researchCreated = 0;
    let itemsCreated = 0;

    for (const [index, symbol] of symbols.entries()) {
      const existingStock = await tx
        .select({ id: stocks.id, name: stocks.name })
        .from(stocks)
        .where(eq(stocks.symbol, symbol))
        .limit(1);
      let stockId = existingStock[0]?.id;
      const stockName = existingStock[0]?.name ?? null;
      if (!stockId) {
        const inserted = await tx
          .insert(stocks)
          .values({
            symbol,
            name: null,
            exchangeId: nseId,
            listingStatus: "unknown",
            instrumentType: "equity",
            dataSource: "manual-watchlist",
            lastUpdatedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: stocks.id });
        stockId = inserted[0]?.id;
        if (stockId) stocksCreated += 1;
      }
      if (!stockId) {
        const found = await tx
          .select({ id: stocks.id })
          .from(stocks)
          .where(eq(stocks.symbol, symbol))
          .limit(1);
        stockId = found[0]?.id;
      }
      if (!stockId) throw new Error(`Failed to seed stock row for ${symbol}`);

      const research = await tx
        .insert(aiInfrastructureCompanies)
        .values({
          stockId,
          symbol,
          name: stockName ?? symbol,
          isWatchlistMember: true,
          relevance: emptyRelevance(),
          sourceNotes:
            "Reference row created by the seed script. Name is a symbol placeholder until a " +
            "licensed source supplies the company name; no exposure claims are stored.",
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: aiInfrastructureCompanies.id });
      if (research.length > 0) researchCreated += 1;

      const item = await tx
        .insert(watchlistItems)
        .values({
          watchlistId,
          stockId,
          symbol,
          position: index,
        })
        .onConflictDoNothing()
        .returning({ id: watchlistItems.id });
      if (item.length > 0) itemsCreated += 1;
    }

    return {
      exchanges: 1,
      dataSources: DATA_SOURCES.length,
      indices: INDICES.length,
      watchlist: "AI Infrastructure",
      symbols: symbols.length,
      stocksCreated,
      researchCreated,
      itemsCreated,
    };
  });

  logger.info(summary, "Reference seed completed");
}

seed()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, "Database seed failed");
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
