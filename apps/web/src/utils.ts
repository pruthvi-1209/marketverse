export function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatIndex(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatChange(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function trendLabel(changePercent: number | null): { label: string; kind: "up" | "down" | "flat" | "na" } {
  if (changePercent == null) return { label: "—", kind: "na" };
  if (changePercent > 0) return { label: "Up", kind: "up" };
  if (changePercent < 0) return { label: "Down", kind: "down" };
  return { label: "Flat", kind: "flat" };
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function delayLabel(value: string | null | undefined): string {
  switch (value) {
    case "delayed_1_3_min":
      return "Delayed 1–3 min";
    case "end_of_day":
      return "End of day";
    case "realtime":
      return "Real-time";
    case "unknown":
      return "Unknown";
    default:
      return value ? value.replace(/_/g, " ") : "Unknown";
  }
}

export function freshnessLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ageLabel(meta: { delayClassification?: string | null; freshness?: { status?: string | null; ageSeconds?: number | null } | null } | null): string {
  const status = meta?.freshness?.status ?? null;
  const age = meta?.freshness?.ageSeconds ?? null;
  if (status === "fresh") return age != null ? `Live data (${Math.round(age / 60)} min ago)` : "Fresh";
  if (status === "stale") return age != null ? `Stale (~${Math.round(age / 60)} min old)` : "Stale";
  if (status === "unknown") return "Freshness unknown";
  return "—";
}
