import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./core/logger/logger";
import { closeDatabase } from "./database/client";
import { startScheduler, stopScheduler } from "./jobs/scheduler";
import { getNseProvider } from "./providers";

async function main(): Promise<void> {
  const app = createApp();
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.PORT, env.HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  logger.info(
    { host: env.HOST, port: env.PORT, environment: env.NODE_ENV },
    "MarketVerse API listening",
  );

  if (env.NSE_MCP_ENABLED) {
    // Warm the tool catalog in the background. A slow or unavailable NSE
    // endpoint must never delay or block API startup.
    void getNseProvider()
      .toolCatalog()
      .then((catalog) => {
        logger.info({ tools: catalog.length }, "NSE MCP tool catalog warmed");
      })
      .catch((error) => {
        logger.warn({ err: error }, "NSE MCP tool catalog warm-up failed");
      });
  }

  startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down MarketVerse API");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out; forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (error) => {
      if (error) logger.error({ err: error }, "HTTP server close failed");
      try {
        await stopScheduler();
        await closeDatabase();
      } catch (closeError) {
        logger.error({ err: closeError }, "Error during shutdown cleanup");
      }
      clearTimeout(forceExit);
      process.exit(error ? 1 : 0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    void shutdown("uncaughtException");
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "Failed to start MarketVerse API");
  process.exit(1);
});
