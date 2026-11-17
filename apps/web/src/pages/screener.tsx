import { useCallback, useState } from "react";
import { api } from "../services/api";
import { useFetch } from "../router";
import { formatDateTime } from "../utils";

export default function Screener({ navigate }: { navigate: (to: string) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const stocks = useFetch(
    () => api.stocks(page, 100, search || undefined),
    [page, search],
    true,
  );

  const handleSearch = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
  }, []);

  const stockList = stocks.data?.data ?? [];
  const pagination = stocks.data?.pagination;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Stock Screener</h1>
        <p className="page-subtitle">Browse the NSE stock universe stored by MarketVerse.</p>
      </div>

      {stocks.error && <div className="notice error">Failed to load stocks: {stocks.error.message}</div>}

      <form className="card" onSubmit={handleSearch} style={{ padding: 16, marginBottom: 24, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-secondary)", margin: 0, whiteSpace: "nowrap" }}>
          Filter
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Symbol or company name"
            style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: "var(--text-sm)", minWidth: 220 }}
          />
        </label>
        <button className="btn-ghost" type="submit">Search</button>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {stocks.data?.pagination.total ?? 0} stocks
        </span>
      </form>

      <div className="card">
        <div className="card-body">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Sector</th>
                  <th>Industry</th>
                  <th>Exchange</th>
                  <th>Listing status</th>
                  <th>Data source</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                  {stocks.loading ? (
                    <tr><td colSpan={8}>Loading stocks…</td></tr>
                  ) : stockList.length === 0 ? (
                    <tr><td colSpan={8}>No stocks match the filter.</td></tr>
                  ) : stockList.map((stock) => (
                  <tr key={stock.id}>
                    <td className="table-cell symbol" style={{ cursor: "pointer" }} onClick={() => navigate(`/research/${encodeURIComponent(stock.symbol)}`)}>
                      {stock.symbol}
                    </td>
                    <td className="table-cell name">{stock.name ?? "—"}</td>
                    <td className="table-cell">{stock.sector ?? "—"}</td>
                    <td className="table-cell">{stock.industry ?? "—"}</td>
                    <td className="table-cell mono">{stock.exchangeCode}</td>
                    <td className="table-cell">{stock.listingStatus}</td>
                    <td className="table-cell muted-xs">{stock.dataSource}</td>
                    <td className="table-cell muted-xs">{formatDateTime(stock.lastUpdatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, fontSize: "var(--text-sm)", color: "var(--text-secondary)", borderTop: "1px solid var(--border)" }}>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-ghost" disabled={!pagination.hasNext} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
