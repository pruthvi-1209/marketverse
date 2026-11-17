import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { createRouter } from "./router";
import MarketOverview from "./pages/market-overview";
import Watchlists from "./pages/watchlists";
import Screener from "./pages/screener";
import Research from "./pages/research";
import ResearchDetail from "./pages/research-detail";
import Portfolios from "./pages/portfolio";
import Alerts from "./pages/alerts";
import { Shell } from "./components/layout";

const routes = [
  { path: "/", component: MarketOverview },
  { path: "/screener", component: Screener },
  { path: "/research", component: Research },
  { path: "/research/:symbol", component: ResearchDetail },
  { path: "/watchlists", component: Watchlists },
  { path: "/watchlists/:id", component: Watchlists },
  { path: "/portfolio", component: Portfolios },
  { path: "/portfolio/:id", component: Portfolios },
  { path: "/alerts", component: Alerts },
];

const Router = createRouter(routes);

function App() {
  return (
    <Shell>
      <Router />
    </Shell>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
