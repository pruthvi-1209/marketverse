import type {
  Alert,
  AlertEvent,
  CreateAlertInput,
  UpdateAlertInput,
} from "@marketverse/contracts";
import { NotFoundError } from "../../core/errors/app-error";
import { storedResponseMeta } from "../../core/http/response-meta";
import { logger } from "../../core/logger/logger";
import { getNotificationProvider } from "../../core/notifications/notification-provider";
import { toNumber } from "../../core/utils/numbers";
import { toIstTradingDate } from "../../core/utils/time";
import { alertRepository } from "../../database/repositories/alerts.repository";
import { indicatorsRepository } from "../../database/repositories/indicators.repository";
import { marketRepository } from "../../database/repositories/market.repository";
import { scoringRepository } from "../../database/repositories/scoring.repository";
import { stocksRepository } from "../../database/repositories/stocks.repository";
import { watchlistRepository } from "../../database/repositories/watchlist.repository";
import type { AlertRow } from "../../database/schema";
import type { ResponseMeta } from "@marketverse/contracts";
import { evaluateAlert, type AlertEvaluationResult } from "./alert-evaluator";

export interface AlertEvaluationSummary {
  evaluated: number;
  triggered: number;
  skipped: number;
  errors: number;
  details: Array<{
    alertId: string;
    alertName: string;
    symbol: string | null;
    triggered: boolean;
    message: string;
    unavailableReason: string | null;
  }>;
}

function mapAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    symbol: row.symbol,
    watchlistId: row.watchlistId,
    operator: row.operator,
    threshold: row.threshold === null ? null : Number(row.threshold),
    parameters: row.parameters,
    enabled: row.enabled,
    cooldownSeconds: row.cooldownSeconds,
    lastTriggeredAt: row.lastTriggeredAt ? row.lastTriggeredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEvent(row: {
  id: string;
  alertId: string;
  triggeredAt: Date;
  observedValue: string | null;
  message: string;
  dedupeKey: string;
  delivered: boolean;
  deliveryError: string | null;
}): AlertEvent {
  return {
    id: row.id,
    alertId: row.alertId,
    triggeredAt: row.triggeredAt.toISOString(),
    observedValue: toNumber(row.observedValue),
    message: row.message,
    dedupeKey: row.dedupeKey,
    delivered: row.delivered,
    deliveryError: row.deliveryError,
  };
}

export class AlertsService {
  async list(): Promise<{ alerts: Alert[]; meta: ResponseMeta }> {
    const rows = await alertRepository.list();
    return { alerts: rows.map(mapAlert), meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async get(id: string): Promise<{ alert: Alert; meta: ResponseMeta }> {
    const row = await alertRepository.findById(id);
    if (!row) throw new NotFoundError("Alert", id);
    return { alert: mapAlert(row), meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async create(input: CreateAlertInput): Promise<{ alert: Alert; meta: ResponseMeta }> {
    const row = await alertRepository.create({
      name: input.name,
      type: input.type,
      symbol: input.symbol ?? null,
      watchlistId: input.watchlistId ?? null,
      operator: input.operator,
      threshold: input.threshold ?? null,
      parameters: input.parameters ?? null,
      cooldownSeconds: input.cooldownSeconds ?? 3600,
    });
    return { alert: mapAlert(row), meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async update(id: string, input: UpdateAlertInput): Promise<{ alert: Alert; meta: ResponseMeta }> {
    const existing = await alertRepository.findById(id);
    if (!existing) throw new NotFoundError("Alert", id);
    const row = await alertRepository.update(id, input);
    return { alert: mapAlert(row), meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async delete(id: string): Promise<{ meta: ResponseMeta }> {
    const existing = await alertRepository.findById(id);
    if (!existing) throw new NotFoundError("Alert", id);
    await alertRepository.delete(id);
    return { meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async events(
    id: string,
    limit = 50,
  ): Promise<{ events: AlertEvent[]; meta: ResponseMeta }> {
    const alert = await alertRepository.findById(id);
    if (!alert) throw new NotFoundError("Alert", id);
    const rows = await alertRepository.events(id, limit);
    return {
      events: rows.map((row) => ({ ...mapEvent(row), alertName: alert.name })),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async recentEvents(limit = 100): Promise<{ events: AlertEvent[]; meta: ResponseMeta }> {
    const rows = await alertRepository.recentEvents(limit);
    return {
      events: rows.map((row) => mapEvent(row)),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  /** Evaluates every enabled alert. Missing data is reported, never guessed. */
  async evaluateAll(): Promise<AlertEvaluationSummary> {
    const alertRows = await alertRepository.enabled();
    const summary: AlertEvaluationSummary = {
      evaluated: 0,
      triggered: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const alert of alertRows) {
      let symbols: string[] = [];
      try {
        symbols = await this.resolveSymbols(alert);
      } catch (error) {
        summary.errors += 1;
        logger.warn({ err: error, alertId: alert.id }, "Unable to resolve alert targets");
        continue;
      }
      if (symbols.length === 0) {
        summary.skipped += 1;
        summary.details.push({
          alertId: alert.id,
          alertName: alert.name,
          symbol: null,
          triggered: false,
          message: `${alert.name}: no target symbols configured`,
          unavailableReason: "no target symbols",
        });
        continue;
      }

      for (const symbol of symbols) {
        try {
          const result = await this.evaluateOne(alert, symbol);
          summary.evaluated += 1;
          if (result.triggered) summary.triggered += 1;
          if (!result.triggered && result.unavailableReason) summary.skipped += 1;
          summary.details.push({
            alertId: alert.id,
            alertName: alert.name,
            symbol,
            triggered: result.triggered,
            message: result.message,
            unavailableReason: result.unavailableReason,
          });
        } catch (error) {
          summary.errors += 1;
          logger.warn({ err: error, alertId: alert.id, symbol }, "Alert evaluation failed");
        }
      }
    }

    return summary;
  }

  /** Evaluates all alerts relevant to one symbol (and watchlist-wide alerts). */
  async evaluateForSymbol(symbol: string): Promise<AlertEvaluationSummary> {
    const normalized = symbol.trim().toUpperCase();
    const alertRows = await alertRepository.enabled();
    const summary: AlertEvaluationSummary = {
      evaluated: 0,
      triggered: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const alert of alertRows) {
      let relevant = alert.symbol === normalized;
      if (!relevant && alert.type === "watchlist_event" && alert.watchlistId) {
        const symbols = await this.resolveSymbols(alert);
        relevant = symbols.includes(normalized);
      }
      if (!relevant) continue;

      try {
        const result = await this.evaluateOne(alert, normalized);
        summary.evaluated += 1;
        if (result.triggered) summary.triggered += 1;
        if (!result.triggered && result.unavailableReason) summary.skipped += 1;
        summary.details.push({
          alertId: alert.id,
          alertName: alert.name,
          symbol: normalized,
          triggered: result.triggered,
          message: result.message,
          unavailableReason: result.unavailableReason,
        });
      } catch (error) {
        summary.errors += 1;
        logger.warn({ err: error, alertId: alert.id, symbol: normalized }, "Alert evaluation failed");
      }
    }
    return summary;
  }

  private async resolveSymbols(alert: AlertRow): Promise<string[]> {
    const symbols = new Set<string>();
    if (alert.symbol) symbols.add(alert.symbol.toUpperCase());
    if (alert.watchlistId) {
      const items = await watchlistRepository.items(alert.watchlistId);
      for (const item of items) symbols.add(item.symbol.toUpperCase());
    }
    return [...symbols];
  }

  private async evaluateOne(alert: AlertRow, symbol: string): Promise<AlertEvaluationResult & {
    triggered: boolean;
  }> {
    const stock = await stocksRepository.findBySymbol(symbol);
    if (!stock) {
      return {
        triggered: false,
        observedValue: null,
        message: `${alert.name}: ${symbol} is not stored yet, so the alert cannot be evaluated`,
        unavailableReason: "stock is not stored",
      };
    }

    const now = new Date();

    // Cooldown gate: never re-fire inside the configured quiet window.
    if (alert.lastTriggeredAt) {
      const elapsedSeconds = (now.getTime() - alert.lastTriggeredAt.getTime()) / 1000;
      if (elapsedSeconds < alert.cooldownSeconds) {
        return {
          triggered: false,
          observedValue: null,
          message: `${alert.name}: skipped, cooldown of ${alert.cooldownSeconds}s is still active`,
          unavailableReason: "cooldown active",
        };
      }
    }

    const [quote, indicators, qualityRows, entryRows, previousEvent] = await Promise.all([
      marketRepository.latestQuote(stock.id),
      indicatorsRepository.latest(stock.id),
      scoringRepository.qualityHistory(stock.id, 30),
      scoringRepository.entryHistory(stock.id, 30),
      alertRepository.latestEvent(alert.id),
    ]);

    const latestQuality = qualityRows[0] ?? null;
    const latestEntry = entryRows[0] ?? null;
    const previousQuality =
      latestQuality === null
        ? null
        : (qualityRows.find((row) => row.asOfDate < latestQuality.asOfDate) ?? null);
    const previousEntry =
      latestEntry === null
        ? null
        : (entryRows.find((row) => row.asOfDate < latestEntry.asOfDate) ?? null);

    const result = evaluateAlert({
      alert,
      symbol,
      latestClose: quote ? toNumber(quote.lastPrice) : null,
      previousClose: quote ? toNumber(quote.previousClose) : null,
      changePercent: quote ? toNumber(quote.changePercent) : null,
      indicators: indicators?.values ?? null,
      qualityScore: latestQuality ? Number(latestQuality.score) : null,
      entryScore: latestEntry ? Number(latestEntry.score) : null,
      previousQualityScore: previousQuality ? Number(previousQuality.score) : null,
      previousEntryScore: previousEntry ? Number(previousEntry.score) : null,
      previousObservedValue: previousEvent ? toNumber(previousEvent.observedValue) : null,
      now,
    });

    if (!result.triggered) return result;

    const tradingDate = quote?.tradingDate ?? toIstTradingDate(now);
    const dedupeKey = `${alert.id}:${tradingDate}`;
    const notificationProvider = getNotificationProvider();

    let delivered = false;
    let deliveryError: string | null = null;
    try {
      await notificationProvider.send({
        alertId: alert.id,
        alertName: alert.name,
        symbol,
        message: result.message,
        observedValue: result.observedValue,
        triggeredAt: now,
        dedupeKey,
      });
      delivered = notificationProvider.enabled;
      if (!notificationProvider.enabled) {
        deliveryError = "no notification channel is configured";
      }
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : String(error);
      logger.warn({ err: error, alertId: alert.id }, "Alert notification delivery failed");
    }

    const recorded = await alertRepository.recordTrigger(
      alert.id,
      {
        observedValue: result.observedValue,
        message: result.message,
        dedupeKey,
        delivered,
        deliveryError,
      },
      now,
    );

    if (!recorded) {
      return {
        triggered: false,
        observedValue: result.observedValue,
        message: `${alert.name}: already triggered for trading date ${tradingDate}`,
        unavailableReason: "duplicate event for this trading date",
      };
    }

    return result;
  }
}

export const alertsService = new AlertsService();
