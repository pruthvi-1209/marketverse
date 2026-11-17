# API reference

Base URL: `http://127.0.0.1:4000/api/v1` (health is at `/health`).

All responses are JSON. Successful responses use a `data`/`meta` envelope.
Collections may add `pagination`.

```json
{
  "data": { },
  "meta": {
    "provider": "nse",
    "tool": "get_bulk_quote",
    "retrievedAt": "2026-11-17T06:45:00.000Z",
    "observedAt": "2026-11-16T10:00:00.000Z",
    "tradingDate": "2026-11-16",
    "delayClassification": "end_of_day",
    "freshness": { "status": "fresh", "ageSeconds": 120, "staleAfterSeconds": 129600 },
    "cached": false,
    "warnings": []
  }
}
```

`delayClassification` is one of `real_time`, `delayed_1_3_min`, `end_of_day`,
`unknown`. MarketVerse only reports what the source supports. `null` fields mean
the value is genuinely unavailable, not zero.

## Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Query parameter validation failed",
    "details": [{ "path": "pageSize", "message": "Number must be less than or equal to 200", "code": "too_big" }],
    "requestId": "0f0c2e1e-…"
  }
}
```

| Status | Codes |
| --- | --- |
| 400 | `BAD_REQUEST`, `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 503 | `PROVIDER_UNAVAILABLE`, `DATA_UNAVAILABLE` |
| 504 | `PROVIDER_TIMEOUT` |

Mutating methods require `x-api-key` only when `API_KEY` is configured. Every
response echoes `x-request-id`.

## Health

### `GET /health`

Always returns HTTP 200 with a machine-readable `status` of `ok`, `degraded` or
`error`.

```json
{
  "data": {
    "status": "ok",
    "uptimeSeconds": 29,
    "version": "1.0.0",
    "environment": "development",
    "checks": {
      "database": { "status": "up", "latencyMs": 15 },
      "nse": { "status": "connected", "detail": null }
    }
  }
}
```

## Stocks

### `GET /stocks`

Query: `search`, `sector`, `exchange`, `listingStatus`, `page` (default 1),
`pageSize` (default 50, max 200), `sortBy` (`symbol|name|lastUpdatedAt`),
`sortOrder` (`asc|desc`).

Returns a paginated list of stored stocks.

```json
{
  "data": [
    {
      "id": "…",
      "symbol": "TCS",
      "name": null,
      "isin": null,
      "exchangeCode": "NSE",
      "sector": null,
      "industry": null,
      "listingStatus": "unknown",
      "instrumentType": "equity",
      "dataSource": "nse",
      "lastUpdatedAt": "2026-11-17T06:42:52.832Z"
    }
  ],
  "meta": { },
  "pagination": { "page": 1, "pageSize": 50, "total": 9, "totalPages": 1, "hasNext": false }
}
```

### `GET /stocks/search?q=TCS`

Searches stored symbols, then the live NSE symbol directory if fewer than five
local matches exist. Returns up to 20 matches. A warning is added when live search
is unavailable.

### `GET /stocks/:symbol`

Returns the stock, its latest stored quote (or a live attempt), and performance
derived from stored history. Missing quotes are omitted, never faked.

### `GET /stocks/:symbol/quote?refresh=true`

Returns the latest quote. `refresh=true` bypasses the cache and asks NSE. Stored
quotes include their own timestamp and stale warnings. Provider failures return
503/504.

### `GET /stocks/:symbol/history`

Query: `from`, `to` (`YYYY-MM-DD`), `limit` (default 300, max 2000),
`order` (`asc|desc`).

Returns daily OHLCV rows. If nothing is stored, the API attempts one history
download; it never synthesises candles.

### `GET /stocks/:symbol/indicators?recalculate=true`

Returns the latest indicator snapshot. `recalculate=true` recomputes from stored
history and records a new versioned row.

```json
{
  "data": {
    "symbol": "TCS",
    "asOfDate": "2026-11-16",
    "calculatedAt": "2026-11-17T06:45:00.000Z",
    "version": "1.0.0",
    "values": { "sma20": 4100.2, "rsi14": 58.1, "atr14": 42.3, "macd": null },
    "missing": ["macd"],
    "observationsUsed": 252
  },
  "meta": { }
}
```

### `GET /stocks/:symbol/scores?recalculate=true`

Returns the combined quality and entry scores as `data`.

```json
{
  "data": {
    "symbol": "TCS",
    "quality": { "score": 68.5, "coveragePercent": 60, "categories": [] },
    "entry": { "score": 54, "coveragePercent": 100, "components": [] },
    "disclaimer": "Scores are informational analytics…"
  },
  "meta": { }
}
```

## Market

### `GET /market/indices?group=broad&nameFilter=NIFTY`

Returns index quotes from the NSE capital-market server. Falls back to stored
index quotes with a warning when the live feed fails. No index value is invented.

### `GET /market/breadth?date=YYYY-MM-DD`

Returns advances, declines, unchanged, advance/decline ratio and traded volume.
`date` is optional; omitted means the latest available session.

### `GET /market/movers?limit=20`

Returns gainers, losers, volume leaders, value leaders, 52-week highs and 52-week
lows. Every list may be empty; missing lists are not padded.

### `GET /market/overview`

Combines indices, breadth and movers into one payload with a single provenance
envelope.

### `GET /market/indices/:symbol/history?limit=180`

Returns index OHLC points, fetching from NSE once when no history is stored.

### `GET /market/volume-trend/:symbol`

Returns 20/50-day average volume, latest volume, relative volume and a trend
classification of `increasing`, `decreasing`, `flat` or `unknown`.

## Watchlists

### `GET /watchlists`

Lists watchlists with item counts. The seeded `AI Infrastructure` list is the
default.

### `POST /watchlists`

```json
{ "name": "Long-term compounders", "description": "Optional", "isDefault": false }
```

Returns 201 with the created watchlist.

### `GET /watchlists/:id`

Returns the watchlist and its items, including the latest stored quote and scores
when available.

### `PATCH /watchlists/:id`

Accepts `name` and/or `description`.

### `DELETE /watchlists/:id`

Returns 204. Items are removed by cascade.

### `POST /watchlists/:id/items`

```json
{ "symbol": "TCS", "position": 0 }
```

The symbol must exist in the database or be resolvable from NSE. Unknown symbols
return 404 rather than creating a placeholder.

### `DELETE /watchlists/:id/items/:symbol`

Returns 200 with `data: null`.

### `PATCH /watchlists/:id/reorder`

```json
{ "symbols": ["TCS", "INFY", "RELIANCE"] }
```

Reorders the listed symbols.

### `GET /watchlists/:id/scores/:symbol`

Returns `{ quality, entry }` for an item. Either may be `null` when no score has
been calculated.

## Portfolios

### `GET /portfolios`

Lists portfolio accounts.

### `POST /portfolios`

```json
{
  "name": "Core holdings",
  "description": "Optional",
  "currency": "INR",
  "benchmarkSymbol": "NIFTY 50",
  "fdAnnualRate": 0.08
}
```

`currency` defaults to INR, `benchmarkSymbol` to `BENCHMARK_INDEX_SYMBOL`, and
`fdAnnualRate` to `BENCHMARK_FD_ANNUAL_RATE`.

### `GET /portfolios/:id`

Returns the account, computed holdings, transactions and performance (if it can be
computed).

### `DELETE /portfolios/:id`

Returns 204. Transactions and holdings cascade; stock rows are never deleted.

### `POST /portfolios/:id/transactions`

```json
{
  "symbol": "TCS",
  "type": "buy",
  "quantity": 10,
  "price": 4000,
  "charges": 25,
  "tradedAt": "2026-01-05T00:00:00.000Z",
  "notes": "Optional"
}
```

A sell larger than the quantity held at that point in time returns 400. Holdings
are recalculated from the full ledger after every write.

### `PATCH /portfolios/:id/transactions/:transactionId`

Accepts any subset of the create fields.

### `DELETE /portfolios/:id/transactions/:transactionId`

Returns 204 and recalculates holdings.

### `GET /portfolios/:id/performance`

```json
{
  "data": {
    "account": { },
    "asOf": "2026-11-17T06:45:00.000Z",
    "investedAmount": 40025,
    "currentValue": 42100,
    "totalUnrealizedPnl": 2075,
    "totalRealizedPnl": 0,
    "totalPnl": 2075,
    "totalPnlPercent": 5.18,
    "allocation": [],
    "comparison": {
      "benchmarkSymbol": "NIFTY 50",
      "benchmarkReturnPercent": 3.1,
      "fdReferenceAnnualRate": 0.08,
      "fdReferenceReturnPercent": 1.2,
      "portfolioReturnPercent": 5.18,
      "excessVsBenchmarkPercent": 2.08,
      "excessVsFdPercent": 3.98,
      "periodStart": "2026-01-05",
      "periodEnd": "2026-11-16",
      "note": "Benchmark and FD comparisons are informational…"
    },
    "dataWarnings": []
  },
  "meta": { }
}
```

Weights use market value when every price is available, otherwise cost, and the
`weightBasis` field says which was used. Missing prices produce warnings rather
than zeros.

## Alerts

### `GET /alerts`

Lists alert rules.

### `POST /alerts`

```json
{
  "name": "TCS above 4500",
  "type": "price_threshold",
  "symbol": "TCS",
  "operator": "above",
  "threshold": 4500,
  "cooldownSeconds": 3600
}
```

Supported `type` values:

| Type | Required fields |
| --- | --- |
| `price_threshold` | `symbol`, `operator`, `threshold` |
| `percent_change` | `symbol`, `operator`, `threshold` |
| `dma_crossover` | `symbol`, `operator`; optional `parameters.dmaPeriod` |
| `rsi_threshold` | `symbol`, `operator`, `threshold` |
| `volume_spike` | `symbol`, `operator`; `parameters.volumeMultiplier` |
| `quality_score_change` | `symbol`, `operator`, `threshold` |
| `entry_score_change` | `symbol`, `operator`, `threshold` |
| `watchlist_event` | `watchlistId`, `operator`, `threshold` |

Operators: `above`, `below`, `crosses_above`, `crosses_below`, `change_above`,
`change_below`. A crossing requires a previous observation; the first evaluation
never fires one blindly.

### `GET /alerts/:id`, `PATCH /alerts/:id`, `DELETE /alerts/:id`

Standard read, partial update and delete (204).

### `GET /alerts/:id/events?limit=50`

Returns triggered events. Each event has a unique dedupe key of
`alertId:tradingDate`, so an alert fires at most once per trading date.

### `GET /alerts/events/recent?limit=100`

Returns recent events across all alerts.

### `POST /alerts/evaluate`

Evaluates every enabled alert immediately and returns a summary:

```json
{
  "data": {
    "evaluated": 3,
    "triggered": 1,
    "skipped": 1,
    "errors": 0,
    "details": [
      { "alertId": "…", "symbol": "TCS", "triggered": true, "message": "TCS price 4600.00 >= 4500…", "unavailableReason": null }
    ]
  }
}
```

Missing data produces `triggered: false` with an `unavailableReason`.

## News

### `GET /news?symbol=TCS&sector=Power&limit=20`

Returns stored articles. With no licensed provider configured, `data` is `[]` and
`meta.warnings` explains why. MarketVerse does not scrape news sites. Sentiment, if
present, is derived metadata, never presented as a sourced fact.

## AI infrastructure

### `GET /ai-infrastructure`

Returns the configured research watchlist with sourced business fields, clearly
labelled interpretation, quotes, indicators, scores and latest news. Coverage
counts show how many companies actually have each data type.

### `GET /ai-infrastructure/:symbol`

Returns one company. Unknown symbols return 404.

### `POST /ai-infrastructure/sync`

Creates any missing reference stock/research rows for `AI_INFRA_WATCHLIST_SYMBOLS`.
It never overwrites curated research and never adds exposure claims.

## System

### `GET /system/status`

Database health, provider status, job state and row counts.

### `GET /system/tools`

The live-discovered MCP tool catalogue for both NSE servers, including input
schemas, required fields, discovery time, and whether MarketVerse uses the tool.

### `GET /system/freshness`

Per-dataset freshness audit (quotes, history, indicators, quality scores, entry
scores, index history, breadth, news, alert events). Status is `fresh`, `stale`,
`missing` or `unknown`.

### `GET /system/jobs`

Every job with its schedule, enabled state, last run and consecutive failures.

### `GET /system/jobs/runs?limit=30`

Recent job attempts from `data_refresh_logs`.

### `POST /system/jobs/:name/run`

Runs a job immediately using the same code path as the scheduler. Unknown job
names return 404.

### `GET /system/labels`

Human-readable labels for the two NSE MCP servers.
