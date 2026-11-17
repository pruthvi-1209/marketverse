import { api } from "../services/api";
import { useFetch } from "../router";
import { formatDateTime } from "../utils";

export default function Alerts() {
  const alerts = useFetch(() => api.alerts(), [], true);
  const events = useFetch(() => api.alertEvents(50), [], true);

  const alertList = alerts.data?.data ?? [];
  const eventList = events.data?.data ?? [];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Alerts</h1>
        <p className="page-subtitle">Price, indicator and score alerts with recent trigger events.</p>
      </div>

      {alerts.error && <div className="notice error">Failed to load alerts: {alerts.error.message}</div>}
      {events.error && <div className="notice error">Failed to load alert events: {events.error.message}</div>}

      <section className="section">
        <div className="card">
          <div className="card-header"><div className="card-title">Active alerts</div></div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Alert</th><th>Type</th><th>Symbol</th><th>Operator</th><th>Threshold</th><th>Enabled</th><th>Last triggered</th></tr>
                </thead>
                <tbody>
                  {alerts.loading ? (
                    <tr><td colSpan={7}>Loading alerts…</td></tr>
                  ) : alertList.length === 0 ? (
                    <tr><td colSpan={7}>No alerts.</td></tr>
                  ) : alertList.map((alert) => (
                    <tr key={alert.id}>
                      <td className="table-cell symbol">{alert.name}</td>
                      <td className="table-cell mono">{alert.type}</td>
                      <td className="table-cell">{alert.symbol ?? "—"}</td>
                      <td className="table-cell mono">{alert.operator ?? "—"}</td>
                      <td className="table-cell mono">{alert.threshold == null ? "—" : alert.threshold.toLocaleString()}</td>
                      <td><span className={`badge ${alert.enabled ? "fresh" : "unknown"}`}>{alert.enabled ? "On" : "Off"}</span></td>
                      <td className="table-cell mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{formatDateTime(alert.lastTriggeredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="card-header"><div className="card-title">Recent events</div></div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Alert</th><th>Observed value</th><th>Message</th><th>Triggered at</th><th>Delivered</th></tr></thead>
                <tbody>
                  {events.loading ? (
                    <tr><td colSpan={5}>Loading events…</td></tr>
                  ) : eventList.length === 0 ? (
                    <tr><td colSpan={5}>No events.</td></tr>
                  ) : eventList.map((event) => (
                    <tr key={event.id}>
                      <td className="table-cell symbol">{event.alertName ?? "—"}</td>
                      <td className="table-cell mono">{event.observedValue == null ? "—" : event.observedValue.toLocaleString()}</td>
                      <td className="table-cell name">{event.message}</td>
                      <td className="table-cell mono">{formatDateTime(event.triggeredAt)}</td>
                      <td><span className={`badge ${event.delivered ? "fresh" : "unknown"}`}>{event.delivered ? "Yes" : "No"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
