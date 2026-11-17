import { useFetch } from "../router";
import { api } from "../services/api";
import { formatPrice, formatIndex, formatPct, trendLabel, formatDateTime } from "../utils";

export default function ResearchDetail({ params, navigate }: { params?: Record<string, string>; navigate: (to: string) => void }) {
  const symbol = params?.symbol?.toUpperCase();
  const detail = useFetch(() => api.stockDetail(symbol!), [symbol], !!symbol);
  const quote = useFetch(() => api.stockQuote(symbol!), [symbol], !!symbol);
  const scores = useFetch(() => api.stockScores(symbol!), [symbol], !!symbol);

  if (!symbol) return <div className="page-header"><h1 className="page-title">Research</h1></div>;
  if (detail.loading || quote.loading || scores.loading)
    return <div className="page-header"><h1 className="page-title">Loading {symbol}…</h1></div>;
  if (detail.error || quote.error || scores.error)
    return <div className="notice error">Failed to load {symbol}: {(detail.error || quote.error || scores.error)!.message}</div>;

  const stock = detail.data?.data;
  const q = quote.data?.data;
  const s = scores.data?.data;

  if (!stock) return <div className="page-header"><h1 className="page-title">Stock not found</h1></div>;

  return (
    <>
      <div className="page-header">
        <button className="btn-ghost" onClick={() => (params ? navigate("/research") : null)} style={{ marginBottom: 16, display: "inline-flex" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to search
        </button>
        <h1 className="page-title">{stock.symbol}<span> {stock.name ?? ""}</span></h1>
        <p className="page-subtitle">{stock.exchangeCode} · {stock.sector ?? "Sector n/a"} · {stock.instrumentType ?? ""}</p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <Metric stat="Last price" value={formatPrice(q?.lastPrice ?? null)} />
        <Metric stat="Daily change" value={q?.changePercent != null ? formatPct(q.changePercent) : "—"} kind={q?.changePercent != null && q.changePercent >= 0 ? "positive" : q?.changePercent != null && q.changePercent < 0 ? "negative" : "neutral"} />
        <Metric stat="Open" value={formatIndex(q?.open ?? null)} />
        <Metric stat="Previous close" value={formatIndex(q?.previousClose ?? null)} />
      </div>

      <section className="section">
        <div className="card">
          <div className="card-header"><div className="card-title">Research scores<span>MarketVerse derived analytics · not investment advice</span></div></div>
          <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            <ScorePanel title="Quality score" value={s?.quality?.score ?? null} />
            <ScorePanel title="Entry score" value={s?.entry?.score ?? null} />
          </div>
          {s?.disclaimer && <p style={{ marginTop: 12, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{s.disclaimer}</p>}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="card-header"><div className="card-title">Quote details<span>Observed market data, delayed 1–3 minutes</span></div></div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Field</th><th>Value</th><th>Field</th><th>Value</th></tr></thead>
                <tbody>
                  <tr>
                    <td className="table-cell">Open</td>
                    <td className="table-cell mono">{formatIndex(q?.open ?? null)}</td>
                    <td className="table-cell">High</td>
                    <td className="table-cell mono">{formatIndex(q?.high ?? null)}</td>
                  </tr>
                  <tr>
                    <td className="table-cell">Low</td>
                    <td className="table-cell mono">{formatIndex(q?.low ?? null)}</td>
                    <td className="table-cell">Volume</td>
                    <td className="table-cell mono">{q?.volume == null ? "—" : q.volume.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="table-cell">Turnover</td>
                    <td className="table-cell mono">{q?.turnover == null ? "—" : `₹${q.turnover.toLocaleString()}`}</td>
                    <td className="table-cell">52-week high</td>
                    <td className="table-cell mono">{formatIndex(q?.yearHigh ?? null)}</td>
                  </tr>
                  <tr>
                    <td className="table-cell">52-week low</td>
                    <td className="table-cell mono">{formatIndex(q?.yearLow ?? null)}</td>
                    <td className="table-cell">Trading date</td>
                    <td className="table-cell mono">{q?.tradingDate ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="table-cell">Observed at</td>
                    <td className="table-cell mono">{formatDateTime(q?.observedAt ?? null)}</td>
                    <td className="table-cell">Delay</td>
                    <td className="table-cell mono">{q?.observedAt ? "delayed 1–3 min" : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {q?.observedAt && (
        <div className="notice warn" style={{ marginTop: 16 }}>
          Quote observed {formatDateTime(q.observedAt)} · delayed market data — not a trading signal.
        </div>
      )}
    </>
  );
}

function Metric({ stat, value, kind }: { stat: string; value: string; kind?: "positive" | "negative" | "neutral" }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{stat}</div>
      <div style={{ fontSize: "var(--text-2xl)", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: kind === "positive" ? "var(--positive)" : kind === "negative" ? "var(--negative)" : "var(--text)" }}>{value}</div>
    </div>
  );
}

function ScorePanel({ title, value }: { title: string; value: number | null }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: "var(--text-3xl)", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: value == null ? "var(--text-muted)" : "var(--text)" }}>
        {value == null ? "N/A" : value}
      </div>
    </div>
  );
}
