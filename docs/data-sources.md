# Data sources and provenance

## Official NSE MCP servers

MarketVerse integrates two public NSE Model Context Protocol servers over
Streamable HTTP. Neither requires authentication.

| Key | URL | Data character |
| --- | --- | --- |
| `nse-bhavcopy` | `https://mcp.nseindia.in/bhavcopy/cm/mcp` | Daily bhavcopy, end-of-day |
| `nse-cm-market` | `https://mcp.nseindia.in/cmmkt/mcp` | Capital-market quotes, delayed roughly 1–3 minutes |

Tool names and argument schemas are **discovered** with `listTools` at runtime.
The client never guesses a tool name or invents arguments. If a tool disappears,
the capability is reported as unavailable; no substitute is silently chosen.

At the time of writing, discovery returns 21 bhavcopy tools and 15 capital-market
tools (36 total). The live catalogue is available at `GET /api/v1/system/tools`
and through `yarn nse:inspect`.

### Capability mapping

| Capability | Server | Verified tool |
| --- | --- | --- |
| Bulk quotes | bhavcopy | `get_bulk_quote` |
| Daily history | bhavcopy | `get_stock_history` |
| Market breadth | bhavcopy | `get_market_breadth` |
| Index snapshot | bhavcopy | `get_index_snapshot` |
| Index history | bhavcopy | `get_index_history` |
| Top movers | bhavcopy | `get_top_movers` |
| Volume leaders | bhavcopy | `get_top_by_volume` |
| Symbol search | bhavcopy | `search_symbols` |
| Symbol lookup | bhavcopy | `nse_lookup_symbol` |
| 52-week range | bhavcopy | `get_52_week_high_low` |
| Market mood | bhavcopy | `get_market_mood` |
| Index performance | bhavcopy | `get_index_performance` |
| Corporate actions | bhavcopy | `get_corporate_actions` |
| Volume analysis | bhavcopy | `get_volume_analysis` |
| Moving average | bhavcopy | `moving_average` |
| Stock quote (CM) | cmmkt | `cm_get_stock_quote` |
| Live indices | cmmkt | `cm_get_live_indices` |
| Index quote | cmmkt | `cm_get_index_quote` |
| Market movers | cmmkt | `nse_get_market_movers` |
| Gainers / losers | cmmkt | `nse_get_gainers`, `nse_get_losers` |
| Equity universe | cmmkt | `cm_get_equity_stocks` |
| Data status | cmmkt | `cm_get_data_status`, `cm_get_allstocks_status` |

Other discovered tools are exposed in the catalogue but not used by this build;
`/system/tools` marks them `supported: false`.

## Delay classification

Every observation carries one of:

- `real_time` — only when the source explicitly proves it (not currently used).
- `delayed_1_3_min` — NSE capital-market feed.
- `end_of_day` — bhavcopy quotes, history, breadth and index snapshots.
- `unknown` — derived or insufficiently labelled data.

MarketVerse never presents end-of-day or delayed data as real-time. UI and API
clients should read `meta.delayClassification` and `meta.freshness` before
displaying a price.

## Provenance envelope

Every externally sourced response includes:

```json
{
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
```

- `retrievedAt` is when MarketVerse received the payload.
- `observedAt` is when the source says the value was observed, if it says so.
- `tradingDate` is the Indian exchange session date, kept separately from UTC
  timestamps.
- `warnings` explains fallbacks, missing fields and stale data.

NSE wall-clock timestamps such as `2026-11-16 16:00:28` carry no offset. They are
interpreted as IST (`+05:30`). Explicit offsets and `Z` timestamps are honoured as
given. Trading dates in `DD-MMM-YYYY` form are normalised to `YYYY-MM-DD`.

## Payload handling

Verified shapes include:

- Bulk quote: `{ symbol, close, open, high, low, prev_close, pct_change, volume, date }`
- History: `data[]` with `{ ltp, open, high, low, close, prevClose, volume, totalTradedValue, date }` and `next_end_date`
- Breadth: `{ advances, declines, unchanged, ad_ratio, total_volume, total_stocks }`
- Index snapshot: `indices[]` with `{ indexName, close, pointsChange, pctChange, pe, pb, divYield }`
- CM quote: `stock { lastTradedPrice, perChange, latestTimestamp, … }`

Responses are validated with Zod. Unknown or malformed values become `null`; rows
that cannot be identified (for example a missing symbol or date) are dropped with
a warning rather than stored under a guessed key.

Raw payload storage is controlled by `NSE_ALLOW_RAW_RESPONSE_STORAGE`. When
enabled, mapped observations may retain the original object for audit. Raw data is
never used to bypass validation.

## Reliability behaviour

| Situation | Behaviour |
| --- | --- |
| Discovery timeout / gateway error | Bounded retries, then cached tool catalogue from disk; warning recorded |
| Quote request failure | Stored quote served with stale warning, or 503/504 if none exists |
| Index feed failure | Stored index quotes with an explicit warning |
| History request failure | Error or empty result; no synthetic candles |
| Symbol not found | 404; no placeholder stock is created |
| Partial bulk response | Missing symbols listed in job details; no fill values |

The MCP connection records `connected`, `unavailable`, `disabled` or `unknown`,
plus last connection and last error timestamps. `/health` and `/system/status`
surface this state.

## News

Neither NSE MCP server exposes news tools. MarketVerse therefore ships a
`NullNewsProvider`:

- `GET /api/v1/news` returns an empty array with a warning.
- No website is scraped.
- A licensed provider can be registered through `setNewsProvider`.
- Manual imports are supported for research workflows; the caller is responsible
  for rights and attribution.

## Terms of use

Data is sourced from the official NSE MCP servers for personal, informational and
educational research. NSE data must not be commercially redistributed or used for
prohibited AI model training or fine-tuning. MarketVerse is not investment advice
and is not affiliated with NSE.

## Diagnostics

```bash
yarn nse:inspect   # prints both catalogues, schemas and support status
yarn nse:test      # runs representative live calls and prints a pass/fail summary
yarn test:live     # opt-in Vitest checks (LIVE_NSE_TESTS=1)
```

`nse:test` and `nse:inspect` are safe to run repeatedly. They do not write market
data to the database; persistence happens through the data service and jobs.
