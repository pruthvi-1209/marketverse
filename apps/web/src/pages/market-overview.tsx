import { api } from "../services/api";
import { FlashPrice } from "../components/flash-price";
import { LIVE_POLL_MS, useFetch } from "../router";
import { formatChange, formatIndex, formatPct, formatPrice, trendLabel, ageLabel, delayLabel, freshnessLabel } from "../utils";
import type { IndexQuote, ResponseMeta, ApiWatchlist } from "../types";

const PREFERRED_HEADLINES = ["NIFTY 50", "NIFTY BANK"];

function headlineIndices(overview: IndexQuote[], all: IndexQuote[]): Array<IndexQuote | null> {
  const bySymbol = (quote: IndexQuote, symbol: string) => quote.symbol.toUpperCase() === symbol;
  const picked: IndexQuote[] = [];
  for (const symbol of PREFERRED_HEADLINES) {
    const found = overview.find((q) => bySymbol(q, symbol)) ?? all.find((q) => bySymbol(q, symbol));
    if (found && !picked.includes(found)) picked.push(found);
  }
  for (const quote of overview) {
    if (picked.length >= 2) break;
    if (!picked.includes(quote)) picked.push(quote);
  }
  const cards = picked.slice(0, 2) as Array<IndexQuote | null>;
  while (cards.length < 2) cards.push(null);
  return cards;
}

function MetricCard({ index, meta }: { index: IndexQuote | null; meta?: ResponseMeta | null }) {
  const unavailable = !index || index.lastPrice == null || index.changePercent == null;
  const trend = trendLabel(index?.changePercent ?? null);

  return (
    <article className={`metric ${unavailable ? "unavailable" : ""}`}>
      <div className="metric-inner">
        <div className="symbol-row">
          <div className="metric-symbol">{index?.symbol ?? "NIFTY 50"}</div>
          <span className="metric-name">{index?.name ?? "National Stock Exchange"}</span>
        </div>
        <div className={`metric-value ${unavailable ? "unavailable" : ""}`}>
          {unavailable ? "—" : <FlashPrice value={index.lastPrice} format={formatIndex} />}
        </div>
        <div className={`metric-change ${index?.changePercent != null && index.changePercent >= 0 ? "positive" : index?.changePercent != null && index.changePercent < 0 ? "negative" : "neutral"}`}>
          {unavailable ? "N/A" : formatChange(index.change ?? 0)}
        </div>
        <div className={`metric-change ${trend.kind === "up" ? "positive" : trend.kind === "down" ? "negative" : "neutral"}`}>
          {trend.label}
        </div>
      </div>
      <div className="metric-footer">
        {unavailable ? "Data unavailable — not in current market feed" : `NSE · ${ageLabel(meta ?? null)}`}
      </div>
    </article>
  );
}

export default function MarketOverview({ navigate }: { navigate: (to: string) => void }) {
  const overview = useFetch(() => api.marketOverview(), [], true, LIVE_POLL_MS);
  const indices = useFetch(() => api.marketIndices(), [], true, LIVE_POLL_MS);

  const allIndices: IndexQuote[] = indices.data?.data ?? [];
  const overviewIndices: IndexQuote[] = overview.data?.data.indices ?? [];
  const meta = overview.data?.meta ?? null;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Market Overview<span> — NSE India</span></h1>
        <p className="page-subtitle">Indices, breadth and your default watchlist. All prices are delayed 1–3 minutes unless noted.</p>
      </div>

      {overview.error && (
        <div className="notice error">Failed to load market overview: {overview.error.message}</div>
      )}

      <div className="grid grid-2" style={{ marginBottom: 32 }}>
        {headlineIndices(overviewIndices, allIndices).map((index, position) => (
          <MetricCard key={index?.symbol ?? `placeholder-${position}`} index={index} meta={meta} />
        ))}
      </div>

      <section className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Market status &amp; data freshness</div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span className={`badge ${meta?.freshness.status === "fresh" ? "fresh" : meta?.freshness.status === "stale" ? "stale" : "unknown"}`}>
                <span className="metric-dot" />
                {freshnessLabel(meta?.freshness.status)}
              </span>
              <span className="badge">
                {delayLabel(meta?.delayClassification)}
              </span>
              <span className="badge">Trading date {overview.data?.data.tradingDate ?? "—"}</span>
            </div>
            {meta?.retrievedAt ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: 4 }}>
                Last refreshed {new Date(meta.retrievedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {ageLabel(meta)}
              </p>
            ) : (
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: 4 }}>{ageLabel(meta)}</p>
            )}
            {meta && meta.warnings.length > 0 && (
              <div className="notice warn">{meta.warnings.join(" ")}</div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Watchlist — AI Infrastructure<span>9 stocks · prices delayed 1–3 min</span></div>
            <div className="card-actions">
              <button className="icon-btn" title="View watchlist" onClick={() => navigate("/watchlists")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div className="card-body">
            <WatchlistTable />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Market indices<span>{allIndices.length} indices available</span></div>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th className="mono">Last price</th>
                    <th>Change</th>
                    <th className="mono">Change %</th>
                  </tr>
                </thead>
                <tbody>
                  {allIndices.map((index) => {
                    const trend = trendLabel(index.changePercent);
                    return (
                      <tr key={index.symbol} className="hoverable">
                        <td className="table-cell symbol">{index.symbol}</td>
                        <td className="table-cell name">{index.name}</td>
                        <td className="table-cell price mono">
                          <FlashPrice value={index.lastPrice} format={formatIndex} />
                        </td>
                        <td className={`change-cell ${index.changePercent != null && index.changePercent >= 0 ? "positive" : index.changePercent != null && index.changePercent < 0 ? "negative" : "neutral"}`}>
                          {index.change == null ? "—" : formatChange(index.change)}
                        </td>
                        <td className={`change-cell ${index.changePercent != null && index.changePercent >= 0 ? "positive" : index.changePercent != null && index.changePercent < 0 ? "negative" : "neutral"}`}>
                          {formatPct(index.changePercent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function WatchlistTable() {
  const watchlists = useFetch(() => api.watchlists(), [], true, LIVE_POLL_MS);
  const defaultWatchlist = watchlists.data?.data.find((w) => w.isDefault) ?? watchlists.data?.data[0];

  const watchlistData = useFetch<ApiWatchlist>(
    () =>
      defaultWatchlist
        ? api.watchlist(defaultWatchlist.id)
        : Promise.resolve({ data: null } as unknown as ApiWatchlist),
    [defaultWatchlist?.id],
    !!defaultWatchlist,
    LIVE_POLL_MS,
  );

  const wl = watchlistData.data?.data;

  return (
    <div className="table-wrap">
      {watchlists.loading ? (
        <div className="empty-state">Loading watchlists…</div>
      ) : watchlists.error ? (
        <div className="notice error">Failed to load watchlists: {watchlists.error.message}</div>
      ) : !defaultWatchlist ? (
        <div className="empty-state"><p>No watchlist available.</p></div>
      ) : watchlistData.loading ? (
        <div className="empty-state">Loading watchlist…</div>
      ) : watchlistData.error ? (
        <div className="notice error">Failed to load watchlist: {watchlistData.error.message}</div>
      ) : wl ? (
        <table className="table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>Daily change</th>
              <th>Quality score</th>
              <th>Entry score</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {(wl.items ?? []).map((item) => {
              const quote = item.quote;
              const trend = trendLabel(quote?.changePercent ?? null);
              const q = item.qualityScore?.score;
              const e = item.entryScore?.score;
              return (
                <tr key={item.id}>
                  <td className="table-cell symbol">{item.symbol}</td>
                  <td className="table-cell price mono">
                    <FlashPrice value={quote?.lastPrice} format={formatPrice} />
                  </td>
                  <td className={`change-cell ${quote?.changePercent != null && quote.changePercent >= 0 ? "positive" : quote?.changePercent != null && quote.changePercent < 0 ? "negative" : "neutral"}`}>
                    {formatPct(quote?.changePercent ?? null)}
                  </td>
                  <td className={`score-cell ${q == null ? "na" : ""}`}>{q == null ? "N/A" : q}</td>
                  <td className={`score-cell ${e == null ? "na" : ""}`}>{e == null ? "N/A" : e}</td>
                  <td className={`trend-cell ${trend.kind}`}>{trend.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty-state"><p>No watchlist items found.</p></div>
      )}
    </div>
  );
}
