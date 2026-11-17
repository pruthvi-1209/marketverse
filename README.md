# MarketVerse

MarketVerse is a backend for Indian equity-market intelligence. It collects
official NSE data through the two public NSE Model Context Protocol (MCP)
servers, stores every observation with provenance, derives technical indicators
and two independent scores, and exposes a typed REST API.

The API never invents market data. When a source is unavailable, stale or
missing, the response says so through `meta` and the affected fields stay
`null`. Scores award no points for data that does not exist.

> Educational and research software. Not investment advice. NSE data is delayed
> or end-of-day and must not be commercially redistributed.

## Stack

- Node.js 22, TypeScript (strict), CommonJS output
- Express 5, Helmet, CORS, express-rate-limit, Pino
- PostgreSQL 16, Drizzle ORM and Drizzle Kit
- Zod v3 contracts shared by the API and clients
- Official `@modelcontextprotocol/sdk` Streamable HTTP client
- Vitest + Supertest
- Yarn 4.9.2 workspaces

## Repository layout

```
apps/api/                 Express API, provider client, jobs, tests, scripts
packages/contracts/       Shared Zod schemas and TypeScript types
docs/                     Architecture, API, scoring and data-source docs
compose.yaml              PostgreSQL 16 (+ optional API container)
```

## Quick start

### 1. Install

```bash
corepack enable
yarn install
cp .env.example .env
```

### 2. Start PostgreSQL 16

Using Docker (recommended):

```bash
docker compose up -d postgres
# then in .env:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/marketverse
```

If port 5432 is already in use, publish the container on another port with
`POSTGRES_PORT=5433 docker compose up -d postgres` and use `:5433` in
`DATABASE_URL`. Never delete the `marketverse-pgdata` volume if it holds data.

Or with Homebrew PostgreSQL 16 on an isolated port, leaving any existing
database untouched:

```bash
PGBIN=/usr/local/opt/postgresql@16/bin
"$PGBIN/initdb" -D /usr/local/var/marketverse-pg16 --encoding=UTF8 --locale=C
LC_ALL=C "$PGBIN/pg_ctl" -D /usr/local/var/marketverse-pg16 \
  -o "-p 5433 -c listen_addresses=127.0.0.1" \
  -l /usr/local/var/marketverse-pg16.log start
"$PGBIN/createdb" -p 5433 -h 127.0.0.1 marketverse
```

If you use port 5433, set:

```dotenv
DATABASE_URL=postgresql://<user>@127.0.0.1:5433/marketverse
```

### 3. Migrate and seed

```bash
yarn db:migrate
yarn db:seed
```

The seed creates only reference rows: the NSE exchange, data-source registry,
index metadata, and the configurable `AI Infrastructure` watchlist. It never
inserts quotes, prices, fundamentals or news.

### 4. Run

```bash
yarn dev          # tsx watch
# or
yarn build && yarn start
```

- API base URL: `http://127.0.0.1:4000/api/v1`
- Health: `http://127.0.0.1:4000/health`

## Scripts

| Command | Purpose |
| --- | --- |
| `yarn dev` | Start the API with file watching |
| `yarn build` | Build contracts and the API |
| `yarn start` | Run the compiled API |
| `yarn typecheck` | Strict TypeScript check (source, tests, scripts) |
| `yarn test` | Unit, MCP-mapper and integration tests |
| `yarn test:unit` | Unit and mapper tests only |
| `yarn test:integration` | Database-backed API tests (skipped without a migrated DB) |
| `yarn test:live` | Opt-in live NSE MCP tests (`LIVE_NSE_TESTS=1`) |
| `yarn db:generate` | Generate Drizzle migrations from the schema |
| `yarn db:migrate` | Apply migrations |
| `yarn db:seed` | Idempotent reference seed |
| `yarn db:reset-test` | Drop and recreate a **test-only** database |
| `yarn nse:inspect` | Discover and print the live NSE tool catalogue |
| `yarn nse:test` | Execute representative live tool calls and report results |

## API at a glance

All responses use a `{ data, meta }` envelope. `meta` carries provider,
retrieval time, observed time, IST trading date, delay classification, freshness,
cache status and warnings.

| Area | Routes |
| --- | --- |
| Health | `GET /health` |
| Stocks | `GET /api/v1/stocks`, `/stocks/search`, `/stocks/:symbol`, `/quote`, `/history`, `/indicators`, `/scores` |
| Market | `GET /api/v1/market/indices`, `/breadth`, `/movers`, `/overview`, `/indices/:symbol/history`, `/volume-trend/:symbol` |
| Watchlists | `GET/POST /api/v1/watchlists`, `GET/PATCH/DELETE /:id`, item add/remove/reorder, per-item scores |
| Portfolios | `GET/POST /api/v1/portfolios`, `GET/DELETE /:id`, transactions, performance |
| Alerts | `GET/POST /api/v1/alerts`, `GET/PATCH/DELETE /:id`, `/events`, `/evaluate`, `/events/recent` |
| News | `GET /api/v1/news` |
| AI infrastructure | `GET /api/v1/ai-infrastructure`, `/sync`, `/:symbol` |
| System | `GET /api/v1/system/status`, `/tools`, `/freshness`, `/jobs`, `/jobs/runs`, `POST /jobs/:name/run` |

See [docs/api.md](docs/api.md) for payloads and examples.

## Data and scoring philosophy

- Every observation records its source, tool, retrieval time, observation time,
  delay classification and freshness.
- NSE bhavcopy history is end-of-day. The capital-market feed may be delayed by
  one to three minutes. Nothing is labelled real-time unless the source proves it.
- Missing data yields `null`, an explicit `missing` list, or a warning. It is
  never replaced with zero, an average or a guessed value.
- The quality score (long-term business and trend quality) and the entry score
  (current price structure and timing) are computed independently.
- News is empty unless a licensed provider or a manual import supplies articles.
  MarketVerse does not scrape news websites.

Read [docs/scoring-methodology.md](docs/scoring-methodology.md) for the exact
weights and [docs/data-sources.md](docs/data-sources.md) for source behaviour.

## Scheduled jobs

`JOBS_ENABLED=false` by default. When enabled, jobs run in the exchange timezone
(`Asia/Kolkata`) and every attempt is persisted in `data_refresh_logs`:

| Job | Default schedule | Purpose |
| --- | --- | --- |
| `market-refresh` | `*/5 9-16 * * 1-5` | Index snapshot, breadth, tracked-symbol quotes |
| `history-sync` | `30 18 * * 1-5` | Daily OHLCV history |
| `indicators` | `0 19 * * 1-5` | Recompute indicators |
| `scores` | `15 19 * * 1-5` | Recompute quality and entry scores |
| `alerts` | `*/10 9-16 * * 1-5` | Evaluate enabled alerts |
| `news` | `0 */2 * * *` | Refresh from a licensed provider (no-op by default) |
| `data-quality` | `45 19 * * 1-5` | Read-only integrity audit |

Jobs can be triggered manually through `POST /api/v1/system/jobs/:name/run`.

## Configuration

Configuration is validated by Zod at startup. Invalid or missing required values
fail loudly. The main environment variables are documented in
[.env.example](.env.example).

Mutating endpoints require `x-api-key` only when `API_KEY` is set. Reads remain
open. Rate limiting is enabled by default and disabled under `NODE_ENV=test`.

## Tests

```bash
yarn test          # 63 tests: 49 unit/mapper + 14 integration
yarn test:live     # live NSE checks, opt-in
```

Integration tests skip themselves when PostgreSQL is unavailable or has no
migrations. `yarn db:reset-test` refuses to run unless the database name
contains `test`.

## Documentation

- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Scoring methodology](docs/scoring-methodology.md)
- [Data sources and provenance](docs/data-sources.md)
