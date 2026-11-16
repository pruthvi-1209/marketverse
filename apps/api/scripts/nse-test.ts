/* eslint-disable no-console */
import { toIstTradingDate } from "../src/core/utils/time";
import { env } from "../src/config/env";
import { getNseProvider } from "../src/providers";
import { buildSampleArguments } from "../src/providers/nse/diagnostic-arguments";
import { NSE_TERMS_NOTE } from "../src/providers/nse/tool-catalog";

interface CallTarget {
  server: "nse-bhavcopy" | "nse-cm-market";
  tool: string;
  label: string;
}

/** Curated read-only calls. Only tools that actually exist are executed. */
const TARGETS: CallTarget[] = [
  { server: "nse-bhavcopy", tool: "search_symbols", label: "Symbol search" },
  { server: "nse-bhavcopy", tool: "get_bulk_quote", label: "Bulk quote" },
  { server: "nse-bhavcopy", tool: "get_stock_history", label: "Daily OHLCV history" },
  { server: "nse-bhavcopy", tool: "get_market_breadth", label: "Market breadth" },
  { server: "nse-bhavcopy", tool: "get_index_snapshot", label: "Index snapshot" },
  { server: "nse-bhavcopy", tool: "get_top_movers", label: "Top movers" },
  { server: "nse-bhavcopy", tool: "get_52_week_high_low", label: "52-week range" },
  { server: "nse-cm-market", tool: "cm_get_stock_quote", label: "CM stock quote" },
  { server: "nse-cm-market", tool: "cm_get_live_indices", label: "CM live indices" },
  { server: "nse-cm-market", tool: "nse_get_market_movers", label: "CM market movers" },
  { server: "nse-cm-market", tool: "cm_get_data_status", label: "CM data freshness" },
];

function preview(value: unknown, maxLength = 320): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

async function main(): Promise<void> {
  console.log("MarketVerse — NSE MCP read-only smoke test");
  console.log(`Enabled: ${env.NSE_MCP_ENABLED} | Diagnostic date (IST): ${toIstTradingDate(new Date())}\n`);

  const nse = getNseProvider();
  const connections = { "nse-bhavcopy": nse.bhavcopy, "nse-cm-market": nse.cmMarket };
  const today = toIstTradingDate(new Date());

  let executed = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of TARGETS) {
    const connection = connections[target.server];
    const prefix = `[${target.server}] ${target.tool} (${target.label})`;

    let tools;
    try {
      tools = await connection.discoverTools();
    } catch (error) {
      console.log(`SKIP  ${prefix}\n      server unreachable: ${error instanceof Error ? error.message : String(error)}`);
      skipped += 1;
      continue;
    }

    const tool = tools.find((candidate) => candidate.name === target.tool);
    if (!tool) {
      console.log(`SKIP  ${prefix}\n      tool is not exposed by the server in its current form`);
      skipped += 1;
      continue;
    }

    const { arguments: args, unsupportedRequiredFields } = buildSampleArguments(tool, today);
    if (unsupportedRequiredFields.length > 0) {
      console.log(
        `SKIP  ${prefix}\n      cannot satisfy required schema fields safely: ${unsupportedRequiredFields.join(", ")}`,
      );
      skipped += 1;
      continue;
    }

    console.log(`CALL  ${prefix}\n      arguments: ${JSON.stringify(args)}`);
    try {
      const result = await connection.invokeRaw(target.tool, args);
      executed += 1;
      console.log(`OK    ${prefix}`);
      console.log(`      response: ${preview(result.data)}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL  ${prefix}\n      ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log("");
  }

  console.log("Summary");
  console.log(`  executed: ${executed}`);
  console.log(`  skipped:  ${skipped}`);
  console.log(`  failed:   ${failed}`);
  console.log(`\n${NSE_TERMS_NOTE}`);

  // A live outage is documented, not fatal: the backend must keep working.
  if (executed === 0 && skipped + failed > 0) {
    console.log("\nNo live NSE calls succeeded. See the reasons above; this is recorded as unverified live integration.");
  }
}

main().catch((error) => {
  console.error("NSE smoke test failed unexpectedly:", error);
  process.exitCode = 1;
});
