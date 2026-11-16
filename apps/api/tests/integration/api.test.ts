import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { checkDatabaseHealth, closeDatabase, db } from "../../src/database/client";
import { exchangeRepository } from "../../src/database/repositories/exchanges.repository";
import { stocks } from "../../src/database/schema";
import { logger } from "../../src/core/logger/logger";

describe("API integration", () => {
  let databaseReady = false;
  const app: Express = createApp();
  const suffix = Date.now().toString(36).toUpperCase();
  const symbol = `TV${suffix}`.slice(0, 32);
  const watchlistName = `Vitest Watchlist ${suffix}`;
  const portfolioName = `Vitest Portfolio ${suffix}`;
  let stockId: string | null = null;
  let watchlistId: string | null = null;
  let portfolioId: string | null = null;
  let alertId: string | null = null;

  beforeAll(async () => {
    const health = await checkDatabaseHealth();
    databaseReady = health.connected && (health.migrationCount ?? 0) > 0;
    if (!databaseReady) {
      logger.warn(
        "Integration tests skipped: PostgreSQL is unavailable or migrations have not been applied.",
      );
    }
  });

  /** Registers a test that is skipped explicitly when the database is absent. */
  const itDb = (name: string, fn: () => Promise<void>): void => {
    it(name, async (context) => {
      if (!databaseReady) {
        context.skip();
        return;
      }
      await fn();
    });
  };

  async function ensureTestStock(): Promise<string> {
    const exchange = await exchangeRepository.ensureNse();
    const rows = await db
      .insert(stocks)
      .values({
        symbol,
        name: "Integration test instrument",
        exchangeId: exchange.id,
        listingStatus: "unknown",
        instrumentType: "equity",
        dataSource: "test-fixture",
        lastUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: stocks.symbol,
        set: { lastUpdatedAt: new Date() },
      })
      .returning({ id: stocks.id });
    const id = rows[0]?.id;
    if (!id) throw new Error("Failed to create integration test stock");
    stockId = id;
    return id;
  }

  afterAll(async () => {
    try {
      if (databaseReady) {
        if (watchlistId) {
          await request(app).delete(`/api/v1/watchlists/${watchlistId}`);
        }
        if (portfolioId) {
          await request(app).delete(`/api/v1/portfolios/${portfolioId}`);
        }
        if (alertId) {
          await request(app).delete(`/api/v1/alerts/${alertId}`);
        }
        if (stockId) {
          await db.delete(stocks).where(eq(stocks.id, stockId));
        }
      }
    } finally {
      await closeDatabase();
    }
  });

  itDb("reports health with a connected database", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body.data.status).toBe("ok");
    expect(response.body.data.checks.database.status).toBe("up");
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  itDb("returns system status", async () => {
    const response = await request(app).get("/api/v1/system/status").expect(200);
    expect(response.body.data.database.connected).toBe(true);
    expect(Array.isArray(response.body.data.providers)).toBe(true);
  });

  itDb("reports data freshness for every tracked dataset", async () => {
    const response = await request(app).get("/api/v1/system/freshness").expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    const names = response.body.data.map((entry: { dataset: string }) => entry.dataset);
    expect(names).toContain("market_quotes");
    expect(names).toContain("investment_scores");
  });

  itDb("lists stocks with pagination metadata", async () => {
    const response = await request(app).get("/api/v1/stocks?pageSize=5").expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.pagination.pageSize).toBe(5);
  });

  itDb("rejects an invalid stock list query", async () => {
    const response = await request(app).get("/api/v1/stocks?pageSize=9999").expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  itDb("returns a stored quote or an explicit provider error, never invented data", async () => {
    await ensureTestStock();
    const response = await request(app).get(`/api/v1/stocks/${symbol}/quote`);
    expect([200, 404, 502, 503, 504]).toContain(response.status);
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      expect(response.body.error.code).toMatch(/PROVIDER|DATA/);
    }
  });

  itDb("runs the watchlist lifecycle", async () => {
    await ensureTestStock();

    const created = await request(app)
      .post("/api/v1/watchlists")
      .send({ name: watchlistName, description: "Integration test watchlist" })
      .expect(201);
    watchlistId = created.body.data.id;

    const added = await request(app)
      .post(`/api/v1/watchlists/${watchlistId}/items`)
      .send({ symbol })
      .expect(201);
    expect(added.body.data.symbol).toBe(symbol);

    const detail = await request(app).get(`/api/v1/watchlists/${watchlistId}`).expect(200);
    expect(detail.body.data.items.some((item: { symbol: string }) => item.symbol === symbol)).toBe(
      true,
    );

    const scores = await request(app)
      .get(`/api/v1/watchlists/${watchlistId}/scores/${symbol}`)
      .expect(200);
    expect(scores.body.data).toHaveProperty("quality");
    expect(scores.body.data).toHaveProperty("entry");

    const removed = await request(app)
      .delete(`/api/v1/watchlists/${watchlistId}/items/${symbol}`)
      .expect(200);
    expect(removed.body.data).toBeNull();
  });

  itDb("rejects a watchlist with an empty name", async () => {
    const response = await request(app)
      .post("/api/v1/watchlists")
      .send({ name: "   " })
      .expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  itDb("runs the portfolio ledger lifecycle", async () => {
    const stockIdValue = await ensureTestStock();

    const created = await request(app)
      .post("/api/v1/portfolios")
      .send({ name: portfolioName, description: "Integration test portfolio" })
      .expect(201);
    portfolioId = created.body.data.id;

    const buy = await request(app)
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .send({
        symbol,
        type: "buy",
        quantity: 10,
        price: 100,
        charges: 5,
        tradedAt: "2026-01-05T00:00:00.000Z",
      })
      .expect(201);
    expect(buy.body.data.symbol).toBe(symbol);

    const detail = await request(app).get(`/api/v1/portfolios/${portfolioId}`).expect(200);
    expect(detail.body.data.id).toBe(portfolioId);
    expect(detail.body.data.transactions.length).toBe(1);

    const performance = await request(app)
      .get(`/api/v1/portfolios/${portfolioId}/performance`)
      .expect(200);
    expect(performance.body.data.investedAmount).toBeCloseTo(1005, 2);
    expect(performance.body.data.comparison.benchmarkSymbol).toBeTruthy();

    const transactionId = buy.body.data.id;
    await request(app)
      .delete(`/api/v1/portfolios/${portfolioId}/transactions/${transactionId}`)
      .expect(204);

    expect(stockIdValue).toBeTruthy();
  });

  itDb("runs the alert lifecycle without firing on missing data", async () => {
    const created = await request(app)
      .post("/api/v1/alerts")
      .send({
        name: `Vitest alert ${suffix}`,
        type: "price_threshold",
        symbol: "RELIANCE",
        operator: "above",
        threshold: 999999,
        cooldownSeconds: 60,
      })
      .expect(201);
    alertId = created.body.data.id;
    expect(created.body.data.enabled).toBe(true);

    const detail = await request(app).get(`/api/v1/alerts/${alertId}`).expect(200);
    expect(detail.body.data.id).toBe(alertId);

    const events = await request(app).get(`/api/v1/alerts/${alertId}/events`).expect(200);
    expect(Array.isArray(events.body.data)).toBe(true);

    const evaluation = await request(app).post("/api/v1/alerts/evaluate").expect(200);
    expect(evaluation.body.data).toHaveProperty("evaluated");
    expect(evaluation.body.data).toHaveProperty("errors");
  });

  itDb("exposes news honestly when no provider is configured", async () => {
    const response = await request(app).get("/api/v1/news").expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta.warnings.join(" ")).toContain("No licensed news provider");
  });

  itDb("serves the AI infrastructure overview", async () => {
    const response = await request(app).get("/api/v1/ai-infrastructure").expect(200);
    expect(Array.isArray(response.body.data.companies)).toBe(true);
    expect(response.body.data.coverage).toHaveProperty("total");
  });

  itDb("returns a structured 404 for unknown routes", async () => {
    const response = await request(app).get("/api/v1/does-not-exist").expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.requestId).toBeTruthy();
  });
});

describe("API without a database", () => {
  it("always serves the root description", async () => {
    const app = createApp();
    const response = await request(app).get("/").expect(200);
    expect(response.body.data.name).toBe("MarketVerse API");
  });
});
