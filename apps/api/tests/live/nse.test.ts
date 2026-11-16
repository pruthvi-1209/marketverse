import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env";
import { getNseProvider } from "../../src/providers";

const describeLive = env.LIVE_NSE_TESTS ? describe : describe.skip;

/**
 * Live tests talk to the public NSE MCP endpoints. They are opt-in via
 * `LIVE_NSE_TESTS=1` and assert provenance, never specific prices.
 */
describeLive("live NSE MCP integration", () => {
  const provider = getNseProvider();

  it("discovers tool catalogues from both official servers", async () => {
    const catalog = await provider.toolCatalog();
    expect(catalog.length).toBeGreaterThan(20);
    const servers = new Set(catalog.map((entry) => entry.server));
    expect(servers.has("nse-bhavcopy")).toBe(true);
    expect(servers.has("nse-cm-market")).toBe(true);
    const names = catalog.map((entry) => entry.tool.name);
    expect(names).toContain("get_bulk_quote");
    expect(names).toContain("cm_get_stock_quote");
  }, 60_000);

  it("fetches a real quote with provenance and an honest delay label", async () => {
    const quotes = await provider.getQuotes(["RELIANCE"]);
    const quote = quotes.find((entry) => entry.symbol === "RELIANCE");
    expect(quote).toBeDefined();
    expect(quote?.provenance.provider).toBe("nse");
    expect(quote?.provenance.tool).toBeTruthy();
    expect(quote?.provenance.retrievedAt).toBeInstanceOf(Date);
    expect(["real_time", "delayed_1_3_min", "end_of_day", "unknown"]).toContain(
      quote?.provenance.delayClassification,
    );
  }, 60_000);

  it("fetches market breadth without inventing counts", async () => {
    const breadth = await provider.getBreadth();
    expect(breadth.advances === null || breadth.advances >= 0).toBe(true);
    expect(breadth.declines === null || breadth.declines >= 0).toBe(true);
    expect(breadth.provenance.provider).toBe("nse");
  }, 60_000);

  it("fetches daily history for a liquid symbol", async () => {
    const candles = await provider.getDailyHistory({ symbol: "RELIANCE", months: 3 });
    expect(candles.length).toBeGreaterThan(0);
    for (const candle of candles.slice(0, 5)) {
      expect(candle.tradingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(candle.provenance.provider).toBe("nse");
    }
  }, 60_000);
});
