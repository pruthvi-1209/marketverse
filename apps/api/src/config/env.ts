import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

/**
 * The API can be started from the repository root or from `apps/api`, and both
 * `yarn dev` and compiled `node dist/server.js` must behave identically, so we
 * resolve configuration relative to this file rather than `process.cwd()`.
 */
const apiPackageRoot = path.resolve(__dirname, "../..");
const repositoryRoot = path.resolve(apiPackageRoot, "../..");

dotenv.config({ path: path.join(repositoryRoot, ".env") });
dotenv.config({ path: path.join(apiPackageRoot, ".env") });
dotenv.config({
  path: [path.join(apiPackageRoot, ".env.local"), path.join(repositoryRoot, ".env.local")],
  override: true,
});

const booleanish = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false", "1", "0", "yes", "no"])
    .default(defaultValue)
    .transform((value) => value === "true" || value === "1" || value === "yes");

const csv = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

export const DEFAULT_AI_INFRASTRUCTURE_SYMBOLS = [
  "TDPOWERSYS",
  "THERMAX",
  "NETWEB",
  "HFCL",
  "CGPOWER",
  "POWERINDIA",
  "STLTECH",
  "AEROFLEX",
  "KRN",
] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  APP_VERSION: z.string().default("1.0.0"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: booleanish("false"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),

  CORS_ORIGINS: csv(""),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  REQUEST_BODY_LIMIT: z.string().default("1mb"),
  API_KEY: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),

  NSE_MCP_ENABLED: booleanish("true"),
  NSE_BHAVCOPY_MCP_URL: z
    .string()
    .url()
    .default("https://mcp.nseindia.in/bhavcopy/cm/mcp"),
  NSE_MARKET_MCP_URL: z.string().url().default("https://mcp.nseindia.in/cmmkt/mcp"),
  NSE_MCP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),
  NSE_MCP_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  NSE_TOOL_CACHE_TTL_MS: z.coerce.number().int().min(1000).default(21_600_000),
  NSE_ALLOW_RAW_RESPONSE_STORAGE: booleanish("true"),

  MARKET_TIMEZONE: z.string().default("Asia/Kolkata"),
  CACHE_TTL_QUOTE_SECONDS: z.coerce.number().int().min(1).default(60),
  CACHE_TTL_HISTORY_SECONDS: z.coerce.number().int().min(1).default(900),
  CACHE_TTL_MARKET_SECONDS: z.coerce.number().int().min(1).default(60),
  QUOTE_STALE_AFTER_SECONDS: z.coerce.number().int().min(1).default(600),
  HISTORY_STALE_AFTER_HOURS: z.coerce.number().int().min(1).default(30),

  AI_INFRA_WATCHLIST_SYMBOLS: csv(DEFAULT_AI_INFRASTRUCTURE_SYMBOLS.join(",")),
  ALERT_NOTIFICATION_CHANNEL: z.enum(["log", "none"]).default("log"),

  BENCHMARK_INDEX_SYMBOL: z.string().default("NIFTY 50"),
  BENCHMARK_FD_ANNUAL_RATE: z.coerce.number().min(0).max(1).default(0.08),

  JOBS_ENABLED: booleanish("false"),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  HISTORY_SYNC_MONTHS: z.coerce.number().int().min(1).max(24).default(12),
  JOB_MARKET_REFRESH_CRON: z.string().default("*/5 9-16 * * 1-5"),
  JOB_HISTORY_SYNC_CRON: z.string().default("30 18 * * 1-5"),
  JOB_INDICATORS_CRON: z.string().default("0 19 * * 1-5"),
  JOB_SCORES_CRON: z.string().default("15 19 * * 1-5"),
  JOB_ALERTS_CRON: z.string().default("*/10 9-16 * * 1-5"),
  JOB_NEWS_CRON: z.string().default("0 */2 * * *"),
  JOB_DATA_QUALITY_CRON: z.string().default("45 19 * * 1-5"),

  LIVE_NSE_TESTS: booleanish("false"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  // Configuration errors must be loud and must never leak secret values.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  repositoryRoot,
  apiPackageRoot,
});

export type Env = typeof env;
