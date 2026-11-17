import { useCallback, useState } from "react";
import { api } from "../services/api";
import { formatPrice, formatIndex, formatDateTime } from "../utils";

export default function Research({ navigate }: { navigate: (to: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string | null; exchangeCode: string }[]>([]);
  const [searchError, setSearchError] = useState<Error | null>(null);

  const handleSearch = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    api.stockSearch(query.trim())
      .then((res) => { setResults(res.data); setSearchError(null); })
      .catch((err) => { setSearchError(err instanceof Error ? err : new Error(String(err))); setResults([]); });
  }, [query]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Stock Research</h1>
        <p className="page-subtitle">Search a symbol, then open its quote, scores and indicators.</p>
      </div>

      <form className="card" onSubmit={handleSearch} style={{ padding: 20, marginBottom: 32, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. RELIANCE, TCS"
          style={{ flex: 1, minWidth: 260, padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: "var(--text-sm)" }}
        />
        <button className="btn-primary" type="submit" disabled={!query.trim()}>Search</button>
      </form>

      {searchError && <div className="notice error">{searchError.message}</div>}

      {results.length > 0 && (
        <div className="card">
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Symbol</th><th>Name</th><th>Exchange</th><th></th></tr></thead>
                <tbody>
                  {results.map((item) => (
                    <tr key={item.symbol}>
                      <td className="table-cell symbol">{item.symbol}</td>
                      <td className="table-cell name">{item.name ?? "—"}</td>
                      <td className="table-cell mono">{item.exchangeCode}</td>
                      <td><button className="btn-ghost" onClick={() => navigate(`/research/${encodeURIComponent(item.symbol)}`)}>Open research</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
