import { Router } from "express";
import type { Health } from "@marketverse/contracts";
import { env } from "../config/env";
import { checkDatabaseHealth } from "../database/client";
import { getNseProvider } from "../providers";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const [database, nse] = await Promise.all([
    checkDatabaseHealth(),
    Promise.resolve(getNseProvider().health()),
  ]);

  const payload: Health = {
    status: !database.connected ? "error" : nse.status === "unavailable" ? "degraded" : "ok",
    uptimeSeconds: Math.round(process.uptime()),
    version: env.APP_VERSION,
    environment: env.NODE_ENV,
    checks: {
      database: {
        status: database.connected ? "up" : "down",
        latencyMs: database.latencyMs,
      },
      nse: {
        status: env.NSE_MCP_ENABLED ? nse.status : "disabled",
        detail: nse.detail,
      },
    },
  };

  // Health is always 200 so monitoring can read the detailed payload; the
  // `status` field is the machine-readable signal.
  res.json({ data: payload });
});
