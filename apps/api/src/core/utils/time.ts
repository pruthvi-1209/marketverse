import type { Freshness, FreshnessStatus } from "@marketverse/contracts";

export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330;

const istDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hour12: false,
});

export interface IstDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

export function istDateParts(date: Date = new Date()): IstDateParts {
  const parts = istDateTimeFormatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number.parseInt(lookup("hour"), 10);
  return {
    year: Number.parseInt(lookup("year"), 10),
    month: Number.parseInt(lookup("month"), 10),
    day: Number.parseInt(lookup("day"), 10),
    // Intl can render midnight as 24 in some ICU versions.
    hour: hour === 24 ? 0 : hour,
    minute: Number.parseInt(lookup("minute"), 10),
    second: Number.parseInt(lookup("second"), 10),
    weekday: lookup("weekday"),
  };
}

/** Indian exchange trading date (`YYYY-MM-DD`) derived from an absolute UTC instant. */
export function toIstTradingDate(date: Date = new Date()): string {
  const { year, month, day } = istDateParts(date);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function isWeekend(date: Date = new Date()): boolean {
  const { weekday } = istDateParts(date);
  return weekday === "Sat" || weekday === "Sun";
}

/** Regular NSE cash-market session in IST. Exchange holidays are unknown to us. */
export function isMarketSessionOpen(date: Date = new Date()): boolean {
  if (isWeekend(date)) return false;
  const { hour, minute } = istDateParts(date);
  const minutes = hour * 60 + minute;
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function freshnessFor(
  observedAt: Date | string | null | undefined,
  staleAfterSeconds: number,
  now: Date = new Date(),
): Freshness {
  if (!observedAt) {
    return { status: "unknown", ageSeconds: null, staleAfterSeconds };
  }
  const observed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(observed.getTime())) {
    return { status: "unknown", ageSeconds: null, staleAfterSeconds };
  }
  const ageSeconds = Math.max(0, Math.round((now.getTime() - observed.getTime()) / 1000));
  const status: FreshnessStatus = ageSeconds <= staleAfterSeconds ? "fresh" : "stale";
  return { status, ageSeconds, staleAfterSeconds };
}

export function startOfIstDayUtc(date: Date = new Date()): Date {
  const { year, month, day } = istDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - IST_OFFSET_MINUTES * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isValidTradingDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Regular session close (15:30 IST) for a trading date, as a UTC instant. */
export function istCloseInstant(tradingDate: string): Date {
  const [year, month, day] = tradingDate.split("-").map((part) => Number.parseInt(part, 10));
  const utcMillis = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 10, 0, 0);
  return new Date(utcMillis);
}
