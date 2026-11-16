import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./core/logger/logger";
import { apiKeyGuard } from "./core/middleware/api-key";
import { errorHandler, notFoundHandler } from "./core/middleware/error-handler";
import { rateLimiter } from "./core/middleware/rate-limit";
import { requestIdMiddleware } from "./core/middleware/request-id";
import { apiRouter } from "./routes";
import { healthRouter } from "./routes/health.routes";

interface RequestWithId {
  requestId?: string;
}

/**
 * Builds the Express application without opening a port, so tests can drive it
 * with Supertest and the process entrypoint stays a thin wrapper.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  // Required for correct client IPs behind a single reverse proxy.
  app.set("trust proxy", 1);

  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin:
        env.CORS_ORIGINS.length === 0
          ? true
          : env.CORS_ORIGINS.map((origin) => origin.trim()).filter(Boolean),
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["content-type", "x-api-key", "x-request-id"],
      exposedHeaders: ["x-request-id"],
      credentials: false,
      maxAge: 600,
    }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as RequestWithId).requestId ?? randomUUID(),
      customProps: (req) => ({ requestId: (req as RequestWithId).requestId ?? null }),
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url?.startsWith("/api/v1/health") === true,
      },
    }),
  );
  app.use(rateLimiter);
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.REQUEST_BODY_LIMIT }));

  // Mutating endpoints accept an optional shared secret. Reads stay open.
  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    apiKeyGuard(req, res, next);
  });

  app.get("/", (_req, res) => {
    res.json({
      data: {
        name: "MarketVerse API",
        version: env.APP_VERSION,
        environment: env.NODE_ENV,
        docs: "/api/v1/system/status",
        health: "/health",
      },
      meta: { generatedAt: new Date().toISOString() },
    });
  });

  app.use(healthRouter);
  app.use("/api/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
