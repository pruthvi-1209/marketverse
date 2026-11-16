import { describe, expect, it } from "vitest";
import { computeLedger } from "../../src/modules/portfolio/portfolio.service";
import { transaction } from "../helpers/fixtures";

describe("portfolio ledger", () => {
  it("tracks quantity, average cost and realized profit across buys and a sell", () => {
    const ledger = computeLedger([
      transaction({ type: "buy", quantity: 10, price: 100 }),
      transaction({ type: "buy", quantity: 10, price: 120 }),
      transaction({ type: "sell", quantity: 5, price: 130 }),
    ]);

    const holding = ledger.holdings[0];
    expect(holding?.quantity).toBe(15);
    expect(holding?.averageBuyPrice).toBeCloseTo(110, 6);
    expect(holding?.investedAmount).toBeCloseTo(1650, 6);
    expect(holding?.realizedPnl).toBeCloseTo(100, 6);
    expect(ledger.totalRealized).toBeCloseTo(100, 6);
    expect(ledger.totalBuyCost).toBeCloseTo(2200, 6);
  });

  it("includes charges in the cost basis and nets them from sale proceeds", () => {
    const ledger = computeLedger([
      transaction({ type: "buy", quantity: 10, price: 100, charges: 20 }),
      transaction({ type: "sell", quantity: 10, price: 110, charges: 10 }),
    ]);

    const holding = ledger.holdings[0];
    expect(holding?.quantity).toBe(0);
    expect(holding?.investedAmount).toBe(0);
    expect(holding?.averageBuyPrice).toBeNull();
    // Proceeds 1100 - 10 = 1090, cost 1020, realized 70.
    expect(holding?.realizedPnl).toBeCloseTo(70, 6);
  });

  it("rejects a sale of shares that are not held at that point in time", () => {
    expect(() =>
      computeLedger([transaction({ type: "sell", quantity: 5, price: 100 })]),
    ).toThrow(/only 0 held/);
  });

  it("orders transactions by trade time rather than insertion order", () => {
    const ledger = computeLedger([
      transaction({
        type: "sell",
        quantity: 5,
        price: 130,
        tradedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
      transaction({
        type: "buy",
        quantity: 10,
        price: 100,
        tradedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);

    expect(ledger.holdings[0]?.quantity).toBe(5);
    expect(ledger.holdings[0]?.realizedPnl).toBeCloseTo(150, 6);
  });

  it("skips zero-quantity rows without corrupting the ledger", () => {
    const ledger = computeLedger([
      transaction({ type: "buy", quantity: 0, price: 100 }),
      transaction({ type: "buy", quantity: 10, price: 100 }),
    ]);
    expect(ledger.holdings[0]?.quantity).toBe(10);
  });
});
