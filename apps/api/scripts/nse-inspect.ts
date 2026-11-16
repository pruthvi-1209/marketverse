/* eslint-disable no-console */
import { toIstTradingDate } from "../src/core/utils/time";
import { getNseProvider } from "../src/providers";
import { NSE_TOOL_CAPABILITIES, NSE_SERVER_LABELS, NSE_TERMS_NOTE } from "../src/providers/nse/tool-catalog";
import { env } from "../src/config/env";

function line(character = "─"): string {
  return character.repeat(78);
}

function printSchema(schema: unknown): void {
  if (!schema) {
    console.log("      (no input schema published)");
    return;
  }
  const pretty = JSON.stringify(schema, null, 2)
    .split("\n")
    .map((row) => `      ${row}`)
    .join("\n");
  console.log(pretty);
}

async function main(): Promise<void> {
  console.log(line("="));
  console.log("MarketVerse — official NSE MCP inspection");
  console.log(`Endpoints:\n  Bhavcopy:  ${env.NSE_BHAVCOPY_MCP_URL}\n  CM Market: ${env.NSE_MARKET_MCP_URL}`);
  console.log(`Enabled: ${env.NSE_MCP_ENABLED} | Timeout: ${env.NSE_MCP_TIMEOUT_MS}ms`);
  console.log(line("="));

  const nse = getNseProvider();
  const servers = [
    { key: "nse-bhavcopy" as const, connection: nse.bhavcopy },
    { key: "nse-cm-market" as const, connection: nse.cmMarket },
  ];

  let anyConnected = false;

  for (const { key, connection } of servers) {
    console.log(`\n## ${NSE_SERVER_LABELS[key]} (${key})`);
    console.log(`URL: ${connection.url}`);

    if (!env.NSE_MCP_ENABLED) {
      console.log("Status: DISABLED (NSE_MCP_ENABLED=false)");
      continue;
    }

    try {
      const tools = await connection.discoverTools(true);
      anyConnected = true;
      const status = connection.getStatus();
      console.log(`Status: CONNECTED (${tools.length} tools)`);
      console.log(`Last connected: ${status.lastConnectedAt?.toISOString() ?? "n/a"}`);

      for (const tool of tools) {
        console.log(`\n  • ${tool.name}`);
        if (tool.description) {
          const summary = tool.description.split("\n")[0] ?? "";
          console.log(`    ${summary.trim()}`);
        }
        console.log(`    Required fields: ${tool.requiredFields.length > 0 ? tool.requiredFields.join(", ") : "(none)"}`);
        console.log("    Input schema:");
        printSchema(tool.inputSchema);
      }

      const available = new Set(tools.map((tool) => tool.name));
      const expected = Object.entries(NSE_TOOL_CAPABILITIES[key]).filter(
        ([, toolName]) => !available.has(toolName),
      );
      console.log("\n  Capability check (expected names from this build):");
      if (expected.length === 0) {
        console.log("    All capabilities exposed by the server are available.");
      } else {
        for (const [capability, toolName] of expected) {
          console.log(`    UNAVAILABLE: ${capability} (expected tool '${toolName}')`);
        }
      }
    } catch (error) {
      const status = connection.getStatus();
      console.log(`Status: UNAVAILABLE — ${Error.prototype.toString.call(status.detail ?? error)}`);
      console.log(`Detail: ${error instanceof Error ? error.message : String(error)}`);
      console.log(
        "MarketVerse keeps running without this server; affected endpoints will report PROVIDER_UNAVAILABLE " +
          "instead of returning fabricated data.",
      );
    }
  }

  console.log(`\n${line()}`);
  console.log(NSE_TERMS_NOTE);
  console.log(`Diagnostic date (IST): ${toIstTradingDate(new Date())}`);
  console.log(line());
  console.log(anyConnected ? "Inspection completed." : "No NSE server was reachable. See details above.");
}

main().catch((error) => {
  console.error("NSE inspection failed unexpectedly:", error);
  process.exitCode = 1;
});
