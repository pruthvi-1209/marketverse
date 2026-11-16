import type { DelayClassification, ResponseMeta } from "@marketverse/contracts";
import { freshnessFor } from "../utils/time";

export interface ProvenanceLike {
  provider?: string;
  tool?: string | null;
  retrievedAt?: Date | string | null;
  observedAt?: Date | string | null;
  tradingDate?: string | null;
  delayClassification?: DelayClassification;
}

const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;
const END_OF_DAY_STALE_AFTER_SECONDS = 36 * 60 * 60;

export function buildResponseMeta(
  provenance: ProvenanceLike,
  options: {
    cached?: boolean;
    warnings?: string[];
    staleAfterSeconds?: number;
    delayClassification?: DelayClassification;
  } = {},
): ResponseMeta {
  const delayClassification =
    options.delayClassification ?? provenance.delayClassification ?? "unknown";
  const staleAfterSeconds =
    options.staleAfterSeconds ??
    (delayClassification === "end_of_day"
      ? END_OF_DAY_STALE_AFTER_SECONDS
      : DEFAULT_STALE_AFTER_SECONDS);
  const retrievedAt = provenance.retrievedAt ?? new Date();
  return {
    provider: provenance.provider ?? "marketverse",
    tool: provenance.tool ?? null,
    retrievedAt: new Date(retrievedAt).toISOString(),
    observedAt: provenance.observedAt ? new Date(provenance.observedAt).toISOString() : null,
    tradingDate: provenance.tradingDate ?? null,
    delayClassification,
    freshness: freshnessFor(provenance.observedAt ?? null, staleAfterSeconds),
    cached: options.cached ?? false,
    warnings: options.warnings ?? [],
  };
}

/** Meta used for responses derived entirely from stored MarketVerse data. */
export function storedResponseMeta(options: {
  provider?: string;
  retrievedAt?: Date;
  observedAt?: Date | null;
  tradingDate?: string | null;
  delayClassification?: DelayClassification;
  warnings?: string[];
}): ResponseMeta {
  return buildResponseMeta(
    {
      provider: options.provider ?? "marketverse",
      tool: null,
      retrievedAt: options.retrievedAt ?? new Date(),
      observedAt: options.observedAt ?? null,
      tradingDate: options.tradingDate ?? null,
      delayClassification: options.delayClassification ?? "unknown",
    },
    { warnings: options.warnings },
  );
}
