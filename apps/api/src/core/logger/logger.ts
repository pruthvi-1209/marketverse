import pino from "pino";
import { env } from "../../config/env";

const transport =
  !env.isProduction && !env.isTest && env.LOG_LEVEL !== "silent"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined;

export const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  base: { service: "marketverse-api", env: env.NODE_ENV },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-api-key']",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "*.password",
      "DATABASE_URL",
      "databaseUrl",
      "connectionString",
    ],
    censor: "[redacted]",
  },
  ...(transport ? { transport } : {}),
});

export type Logger = typeof logger;

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
