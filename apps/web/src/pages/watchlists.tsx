import { useEffect, useState } from "react";
import { api } from "../services/api";
import { FlashPrice } from "../components/flash-price";
import { LIVE_POLL_MS, useFetch } from "../router";
import { formatPrice, formatPct, trendLabel, formatDateTime } from "../utils";

export default function Watchlists({ params, navigate }: { params?: Record<string, string>; navigate: (to: string) => void }) {
  const watchlists = useFetch(() => api.watchlists(), [], true, LIVE_POLL_MS);
  const watchlistList = watchlists.data?.data ?? [];
  const [detailId, setDetailId] = useState<string | null>(params?.id ?? null);

  // Keep the selected watchlist in sync with the route (e.g. browser back / "Back" button).
  useEffect(() => {
    setDetailId(params?.id ?? null);
  }, [params?.id]);

  const detail = useFetch(
    () => api.watchlist(detailId ?? ""),
    [detailId],
    !!detailId,
    LIVE_POLL_MS,
  );

  if (detailId) {
    if (detail.loading) return <div className="page-header"><h1 className="page-title">Loading watchlist…</h1></div>;
    if (detail.error) return <div className="notice error">Failed to load watchlist: {detail.error.message}</div>;
    const wl = detail.data?.data;
    if (!wl) return <div className="empty-state"><p>Watchlist not found.</p></div>;

    return (
      <>
        <div className="page-header">
          <button className="btn-ghost" onClick={() => navigate("/watchlists")} style={{ marginBottom: 16, display: "inline-flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to watchlists
          </button>
          <h1 className="page-title">{wl.name}</h1>
          <p className="page-subtitle">{wl.description ?? "No description"} · {wl.itemCount} items</p>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Daily change</th>
                    <th>Quality</th>
                    <th>Entry</th>
                    <th>Trend</th>
                    <th>Quote observed</th>
                  </tr>
                </thead>
                <tbody>
                  {(wl.items ?? []).map((item) => {
                    const quote = item.quote;
                    const trend = trendLabel(quote?.changePercent ?? null);
                    return (
                      <tr key={item.id}>
                        <td className="table-cell">{item.position + 1}</td>
                        <td className="table-cell symbol">{item.symbol}</td>
                        <td className="table-cell name">{item.name ?? "—"}</td>
                        <td className="table-cell price mono">
                          <FlashPrice value={quote?.lastPrice} format={formatPrice} />
                        </td>
                        <td className={`change-cell ${quote?.changePercent != null && quote.changePercent >= 0 ? "positive" : quote?.changePercent != null && quote.changePercent < 0 ? "negative" : "neutral"}`}>
                          {formatPct(quote?.changePercent ?? null)}
                        </td>
                        <td className={`score-cell ${item.qualityScore?.score == null ? "na" : ""}`}>
                          {item.qualityScore?.score == null ? "N/A" : item.qualityScore.score}
                        </td>
                        <td className={`score-cell ${item.entryScore?.score == null ? "na" : ""}`}>
                          {item.entryScore?.score == null ? "N/A" : item.entryScore.score}
                        </td>
                        <td className={`trend-cell ${trend.kind}`}>{trend.label}</td>
                        <td className="table-cell mono" style={{ color: "var(--text-muted)" }}>
                          {quote?.observedAt ? formatDateTime(quote.observedAt) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(wl.items?.length ?? 0) === 0 && <div className="empty-state" style={{ padding: 32 }}><p>This watchlist is empty.</p></div>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Watchlists</h1>
        <p className="page-subtitle">Saved stock lists and research collections.</p>
      </div>

      {watchlists.error && <div className="notice error">Failed to load watchlists: {watchlists.error.message}</div>}

      <div className="card">
        <div className="card-body">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Watchlist</th>
                  <th>Description</th>
                  <th>Items</th>
                  <th>Type</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {watchlists.loading ? (
                  <tr><td colSpan={5}>Loading watchlists…</td></tr>
                ) : watchlistList.length === 0 ? (
                  <tr><td colSpan={5}>No watchlists.</td></tr>
                ) : watchlistList.map((wl) => (
                  <tr key={wl.id}>
                    <td className="table-cell symbol" style={{ cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => navigate(`/watchlists/${wl.id}`)}>
                      {wl.name}
                    </td>
                    <td className="table-cell name">{wl.description ?? "—"}</td>
                    <td className="table-cell mono">{wl.itemCount}</td>
                    <td><span className="badge fresh">{wl.isDefault ? "Default" : "Custom"}</span></td>
                    <td><button className="btn-ghost" style={{ padding: 4, minWidth: 0 }} onClick={() => navigate(`/watchlists/${wl.id}`)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
