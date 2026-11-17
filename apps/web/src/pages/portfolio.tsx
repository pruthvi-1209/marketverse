import { api } from "../services/api";
import { useFetch } from "../router";
import { formatPrice, formatPct, formatDateTime } from "../utils";

export default function Portfolios({ params, navigate }: { params?: Record<string, string>; navigate: (to: string) => void }) {
  if (params?.id) {
    const detail = useFetch(() => api.portfolioDetail(params.id), [params.id], true);
    const performance = useFetch(() => api.portfolioPerformance(params.id), [params.id], true);

    if (detail.loading || performance.loading)
      return <div className="page-header"><h1 className="page-title">Loading portfolio…</h1></div>;
    if (detail.error || performance.error)
      return <div className="notice error">Failed to load portfolio: {(detail.error || performance.error)!.message}</div>;

    const account = detail.data?.data;
    const perf = performance.data?.data;
    if (!account || !perf) {
      return <div className="page-header"><h1 className="page-title">Portfolio not found</h1></div>;
    }

    return (
      <>
        <div className="page-header">
          <button className="btn-ghost" onClick={() => navigate("/portfolio")} style={{ marginBottom: 16, display: "inline-flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to portfolios
          </button>
          <h1 className="page-title">{account.name}</h1>
          <p className="page-subtitle">{account.currency} · {account.description ?? "No description"} · benchmark {account.benchmarkSymbol}</p>
        </div>

        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <Metric stat="Invested" value={formatPrice(perf.investedAmount)} />
          <Metric stat="Current value" value={formatPrice(perf.currentValue)} />
          <Metric stat="Total P&L" value={perf.totalPnl >= 0 ? `+${formatPrice(perf.totalPnl)}` : `-${formatPrice(Math.abs(perf.totalPnl))}`} kind={perf.totalPnl >= 0 ? "positive" : "negative"} />
          <Metric stat="Total return" value={perf.totalPnlPercent != null ? formatPct(perf.totalPnlPercent) : "—"} kind={perf.totalPnlPercent != null && perf.totalPnlPercent >= 0 ? "positive" : perf.totalPnlPercent != null && perf.totalPnlPercent < 0 ? "negative" : "neutral"} />
        </div>

        <section className="section">
          <div className="card">
            <div className="card-header"><div className="card-title">Holdings<span>{perf.allocation.length} positions</span></div></div>
            <div className="card-body">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Name</th>
                      <th>Qty</th>
                      <th>Avg buy</th>
                      <th>Last price</th>
                      <th>Market value</th>
                      <th>Unrealized P&L</th>
                      <th>Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.allocation.length === 0 ? (
                      <tr><td colSpan={8}>No holdings.</td></tr>
                    ) : perf.allocation.map((holding) => (
                      <tr key={holding.symbol}>
                        <td className="table-cell symbol">{holding.symbol}</td>
                        <td className="table-cell name">{holding.name ?? "—"}</td>
                        <td className="table-cell mono">{holding.quantity.toLocaleString()}</td>
                        <td className="table-cell mono">{formatPrice(holding.averageBuyPrice ?? null)}</td>
                        <td className="table-cell mono">{formatPrice(holding.lastPrice ?? null)}</td>
                        <td className="table-cell mono">{formatPrice(holding.marketValue ?? null)}</td>
                        <td className={`change-cell ${holding.unrealizedPnl != null && holding.unrealizedPnl >= 0 ? "positive" : holding.unrealizedPnl != null && holding.unrealizedPnl < 0 ? "negative" : "neutral"}`}>
                          {holding.unrealizedPnl == null ? "—" : `${holding.unrealizedPnl >= 0 ? "+" : ""}${holding.unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </td>
                        <td className="table-cell mono">{holding.allocationPercent != null ? `${holding.allocationPercent.toFixed(2)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {perf.dataWarnings.length > 0 && (
          <div className="notice warn">{perf.dataWarnings.join(" ")}</div>
        )}
      </>
    );
  }

  const accounts = useFetch(() => api.portfolios(), [], true);
  const accountList = accounts.data?.data ?? [];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Portfolio</h1>
        <p className="page-subtitle">Investment accounts, holdings and performance vs benchmark.</p>
      </div>

      {accounts.error && <div className="notice error">Failed to load portfolios: {accounts.error.message}</div>}

      <div className="card">
        <div className="card-body">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Account</th><th>Currency</th><th>Benchmark</th><th>FD reference rate</th><th></th></tr>
              </thead>
              <tbody>
                {accounts.loading ? (
                  <tr><td colSpan={5}>Loading portfolios…</td></tr>
                ) : accountList.length === 0 ? (
                  <tr><td colSpan={5}>No portfolios.</td></tr>
                ) : accountList.map((account) => (
                  <tr key={account.id}>
                    <td className="table-cell symbol" style={{ cursor: "pointer" }} onClick={() => navigate(`/portfolio/${account.id}`)}>{account.name}</td>
                    <td className="table-cell">{account.currency}</td>
                    <td className="table-cell mono">{account.benchmarkSymbol}</td>
                    <td className="table-cell mono">{account.fdAnnualRate != null ? `${(account.fdAnnualRate * 100).toFixed(2)}%` : "—"}</td>
                    <td><button className="btn-ghost" onClick={() => navigate(`/portfolio/${account.id}`)}>View</button></td>
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

function Metric({ stat, value, kind }: { stat: string; value: string; kind?: "positive" | "negative" | "neutral" }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{stat}</div>
      <div style={{ fontSize: "var(--text-2xl)", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: kind === "positive" ? "var(--positive)" : kind === "negative" ? "var(--negative)" : "var(--text)" }}>{value}</div>
    </div>
  );
}
