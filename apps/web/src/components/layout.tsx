import { useState } from "react";
import { Link, refreshData, useRouter } from "../router";

const ICONS: Record<string, React.ReactNode> = {
  "market-overview": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
  ),
  screener: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
  ),
  research: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  ),
  watchlists: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
  ),
  portfolio: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="7" y2="10"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="7" y1="20" x2="13" y2="20"/><path d="M20 15v-6a4 4 0 0 0-4-4H4a4 4 0 0 0-4 4v6"/></svg>
  ),
  alerts: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  ),
};

const NAV: { path: string; label: string; key: string }[] = [
  { path: "/", label: "Market Overview", key: "market-overview" },
  { path: "/screener", label: "Stock Screener", key: "screener" },
  { path: "/research", label: "Stock Research", key: "research" },
  { path: "/watchlists", label: "Watchlists", key: "watchlists" },
  { path: "/portfolio", label: "Portfolio", key: "portfolio" },
  { path: "/alerts", label: "Alerts", key: "alerts" },
];

export function Sidebar({ activePath, onSelect }: { activePath: string; onSelect: (path: string) => void }) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark">MV</div>
        <div className="brand-text">Market<span>Verse</span></div>
      </div>
      <div className="sidebar-body">
        <div className="nav-section">
          <div className="nav-section-title">Research</div>
          <ul className="nav-list">
            {NAV.map((item) => (
              <li key={item.path} className="nav-item">
                <Link
                  to={item.path}
                  className={`nav-link ${activePath === item.path ? "active" : ""}`}
                  onClick={() => onSelect(item.path)}
                  aria-current={activePath === item.path ? "page" : undefined}
                >
                  {ICONS[item.key]}
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="nav-footer">MarketVerse terminal · delayed market data</div>
      </div>
    </aside>
  );
}

export function Header({ onMenuToggle, onSearch }: { onMenuToggle: () => void; onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("");

  return (
    <header className="header">
      <div className="header-left">
        <button className="mobile-menu" aria-label="Open navigation" onClick={onMenuToggle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="app-title">Market<span>Verse</span></div>
      </div>
      <form
        className="header-center"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const value = query.trim();
          if (!value) return;
          onSearch(value);
          setQuery("");
        }}
      >
        <div className="search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a stock symbol"
            aria-label="Search a stock symbol"
          />
        </div>
      </form>
      <div className="header-right">
        <button className="refresh-btn" aria-label="Refresh data" onClick={refreshData}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
        <button className="user-btn">
          <div className="user-avatar">U</div>
        </button>
      </div>
    </header>
  );
}

export function MobileDrawer({ isOpen, onClose, onSelect, pathname }: { isOpen: boolean; onClose: () => void; onSelect: (path: string) => void; pathname: string }) {
  return (
    <>
      <div className={`mobile-drawer-overlay ${isOpen ? "open" : ""}`} onClick={onClose} />
      <aside className={`mobile-drawer ${isOpen ? "open" : ""}`} aria-label="Navigation">
        <div className="mobile-drawer-header">
          <div className="brand-text" style={{ fontSize: "var(--text-base)" }}>Market<span>Verse</span></div>
          <button className="mobile-drawer-close" aria-label="Close navigation" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="mobile-drawer-nav">
          <ul className="nav-list">
            {NAV.map((item) => (
              <li key={item.path} className="nav-item">
                <Link
                  to={item.path}
                  className={`nav-link ${pathname === item.path ? "active" : ""}`}
                  onClick={() => { onSelect(item.path); onClose(); }}
                  aria-current={pathname === item.path ? "page" : undefined}
                >
                  {ICONS[item.key]}
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { navigate, pathname } = useRouter();

  const onSelect = (path: string) => {
    if (pathname !== path) navigate(path);
    setMobileOpen(false);
  };

  return (
    <div className="shell">
      <Sidebar activePath={pathname} onSelect={onSelect} />
      <Header
        onMenuToggle={() => setMobileOpen(true)}
        onSearch={(query) => navigate(`/research/${encodeURIComponent(query.toUpperCase())}`)}
      />
      <MobileDrawer isOpen={mobileOpen} onClose={() => setMobileOpen(false)} onSelect={onSelect} pathname={pathname} />
      <main>{children}</main>
    </div>
  );
}
