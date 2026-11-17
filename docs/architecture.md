# Architecture

## Overview

MarketVerse is a single Node.js API process backed by PostgreSQL. It has three
jobs:

1. **Acquire** official NSE observations through MCP tools, with retries,
   timeouts, tool discovery and honest provenance.
2. **Derive** indicators, quality scores, entry scores, portfolio analytics and
   alerts from stored observations.
3. **Serve** a typed REST API and scheduled jobs without hiding missing or stale
   data.

There is no scraping layer. There is no licensed real-time feed. There is no
invented fallback.

```text
                 ┌──────────────────────────────┐
HTTP clients ───▶│ Express 5 (helmet, CORS,     │
                 │ rate limit, request id)      │
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │ Routes → Services            │
                 │ stock / market / watchlist / │
                 │ portfolio / alerts / news /  │
                 │ AI infra / system            │
                 └───────┬───────────┬──────────┘
                         │           │
        ┌────────────────▼──┐   ┌────▼────────────────────┐
        │ Repositories      │   │ Provider interface      │
        │ (Drizzle)         │   │ NseMarketDataProvider    │
        └────────┬──────────┘   └────┬────────────────────┘
                 │                   │ MCP Streamable HTTP
        ┌────────▼──────────┐  ┌─────▼────────────────────┐
        │ PostgreSQL 16     │  │ NSE bhavcopy + cmmkt MCP │
        └───────────────────┘  └──────────────────────────┘

        Jobs → services (same code path as HTTP routes)
```

## Layers

### Configuration (`src/config`)

`env.ts` loads `.env` from the repository root and `apps/api`, validates every
variable with Zod, and freezes the result. Startup fails on invalid config.
Paths are resolved from `__dirname`, so `yarn dev`, `yarn start` and tests behave
identically regardless of the current directory.

### HTTP core (`src/core`)

- `request-id`: accepts a safe incoming `x-request-id` or generates a UUID.
- `error-handler`: maps `AppError` subclasses, Zod errors and PostgreSQL SQLSTATE
  values to the public error envelope. Stack traces are never exposed.
- `api-key`: optional shared secret for mutating methods only.
- `rate-limit`: standard draft-7 headers, disabled under test.
- `response-meta`: builds the provenance envelope used by every successful
  response.
- `notifications`: alert delivery abstraction. The default channel writes a
  structured log line; no mail/SMS/webhook credentials are assumed.

### Routes and services

Routes validate path, query and body with the shared Zod contracts, call a
service, and wrap the result in `{ data, meta }`. Business rules live in services,
not in route handlers. Services depend on the `MarketDataProvider` interface, not
on the MCP implementation, so another legitimate provider can be added without
rewriting analytics.

### Repositories (`src/database/repositories`)

One repository per aggregate. They contain SQL and mapping only. Repositories use
Drizzle with `snake_case` casing. Unique indexes are the last line of defence
against duplicate observations.

### Provider (`src/providers/nse`)

- `McpServerConnection` wraps one MCP endpoint: Streamable HTTP transport,
  request timeout, bounded retries, tool discovery and an on-disk tool-catalogue
  cache used only when discovery fails.
- Tool names and argument shapes are never hard-coded from memory. The client
  discovers them with `listTools`, validates responses with Zod schemas, and
  maps the verified payload shapes into normalized domain objects.
- `NseMarketDataProvider` chooses the appropriate server per capability and
  merges or falls back where justified. Fallbacks are reported, never silent.
- Every normalized object carries a `Provenance` record: provider, tool,
  retrieval time, observed time, IST trading date, delay classification and,
  optionally, the raw response.

### Jobs (`src/jobs`)

`JobRunner` executes a named job with bounded retries and writes every attempt to
`data_refresh_logs`. `node-cron` schedules are registered in `Asia/Kolkata` with
overlap protection. A job result is `success`, `partial` or `skipped`; partial
results name the datasets that failed. Jobs use the same services as the HTTP
API, so behaviour cannot drift between manual and scheduled runs.

### Tests

- Unit: time/IST boundaries, indicator math, score semantics, alert evaluation,
  portfolio ledger.
- MCP: verified NSE payload shapes and IST normalisation.
- Integration: real PostgreSQL, Supertest against `createApp()`, full watchlist,
  portfolio and alert lifecycles. Skipped explicitly when the DB is unavailable.
- Live: opt-in (`LIVE_NSE_TESTS=1`) checks against both official NSE servers.

## Database schema

23 tables. All primary keys are UUIDs unless a natural key is more appropriate.
All timestamps are `timestamptz` stored in UTC. Indian trading dates are separate
`date` columns so an observation can be grouped by exchange session regardless of
the UTC instant.

| Group | Tables |
| --- | --- |
| Reference | `exchanges`, `stocks`, `data_sources` |
| Market | `market_quotes`, `historical_prices`, `market_indices`, `index_history`, `index_quotes`, `market_breadth` |
| Watchlists | `watchlists`, `watchlist_items` |
| Analysis | `technical_indicators`, `investment_scores`, `entry_scores`, `ai_infrastructure_companies`, `company_fundamentals` |
| Portfolio | `portfolio_accounts`, `portfolio_holdings`, `portfolio_transactions` |
| Alerts | `alerts`, `alert_events` |
| News | `news_articles` |
| Operations | `data_refresh_logs` |

Key constraints:

- `stocks.symbol` unique; `watchlists` unique on lower(name); watchlist items
  unique per `(watchlist_id, stock_id)`.
- `historical_prices` unique per `(stock_id, trading_date)`; index history per
  `(index_id, trading_date)`; quotes deduplicated per
  `(stock_id, observed_at, source)`.
- Indicators and scores unique per `(stock_id, as_of_date, version)`.
- `alert_events.dedupe_key` unique, so one alert fires at most once per trading
  date.
- News unique by URL; fundamentals by
  `(stock_id, period_type, period_end, source)`.
- Foreign keys use `restrict` where deleting a parent would destroy audit data and
  `cascade` only for genuinely owned rows (watchlist items, transactions,
  holdings, alert events).

Prices use `numeric(18,4)`; monetary aggregates use `numeric(20,4)`; percentages
and ratios use narrower precision. Calculated rows always store
`calculated_at` and `methodology_version` so a score can be reconstructed.

Multi-table writes run in transactions: quote upsert plus stock touch, portfolio
transaction plus holdings recalculation, and alert event plus `last_triggered_at`.
No historical row is overwritten in a way that destroys auditability; observations
are append-only or deduplicated by their natural key.

## Request lifecycle

1. `request-id` assigns an ID and echoes it in the response header.
2. Helmet and CORS apply headers.
3. Pino HTTP logs the request (health checks excluded).
4. Rate limiter enforces the configured window.
5. JSON body parsing enforces the configured limit.
6. Mutation guard checks `x-api-key` when configured.
7. Zod validation produces a 400 `VALIDATION_ERROR` with field paths.
8. Service executes. Provider calls may retry and may fall back to stored data.
9. Response includes `meta` with provenance and freshness.
10. `errorHandler` produces a structured error with the same request ID.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| PostgreSQL unavailable | `GET /health` returns `status: "error"`; data endpoints return 503 |
| NSE endpoint timeout | Retries, then cached catalogue or stored rows; warnings explain |
| Missing quote | 503 `PROVIDER_UNAVAILABLE` or stored quote with stale warning |
| Missing fundamentals | Score categories report `missing_data`; no points awarded |
| No news provider | Empty list plus an explicit warning |
| Invalid symbol | 404, never a fabricated stock |
| Duplicate alert trigger | Unique dedupe key rejects the second event |
| Job failure | Persisted failure row, bounded retry, process keeps running |

## Operational notes

- `JOBS_ENABLED=false` by default so a laptop does not hammer NSE.
- The scheduler starts after the HTTP listener, and provider warm-up runs in the
  background so startup is never blocked by NSE latency.
- Shutdown stops cron tasks, closes the pool and forces exit after ten seconds.
- NSE tool catalogues are cached on disk to survive discovery outages; the cache
  never substitutes for an actual observation.
