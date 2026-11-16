/** Numeric helpers that never silently coerce missing data into zero. */

export type NumericInput = number | string | null | undefined;

export function toNumber(value: NumericInput): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed.length === 0 || trimmed === "-" || trimmed.toLowerCase() === "null") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundOrNull(value: number | null | undefined, decimals = 2): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round(value, decimals);
}

export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

/** Percentage change from `previous` to `current`, or null when not computable. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function distancePercent(reference: number | null, value: number | null): number | null {
  if (reference === null || value === null) return null;
  if (!Number.isFinite(reference) || !Number.isFinite(value) || reference === 0) return null;
  return ((value - reference) / reference) * 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Numeric values from the database are returned as strings by `pg`. */
export function parseNumeric(value: string | number | null | undefined): number | null {
  return toNumber(value);
}

export function formatNumberOrNull(value: number | null, decimals = 2): string | null {
  if (value === null) return null;
  return value.toFixed(decimals);
}
