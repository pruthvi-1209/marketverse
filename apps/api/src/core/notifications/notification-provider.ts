import { env } from "../../config/env";
import { logger } from "../logger/logger";

export interface AlertNotification {
  alertId: string;
  alertName: string;
  symbol: string | null;
  message: string;
  observedValue: number | null;
  triggeredAt: Date;
  dedupeKey: string;
}

export interface NotificationProvider {
  readonly name: string;
  readonly enabled: boolean;
  send(notification: AlertNotification): Promise<void>;
}

/**
 * Default delivery channel. It writes a structured log line only: MarketVerse
 * has no configured mail/SMS/webhook credentials, and silently pretending an
 * alert was delivered would be worse than recording it as delivered locally.
 */
class LogNotificationProvider implements NotificationProvider {
  readonly name = "log";
  readonly enabled = true;

  async send(notification: AlertNotification): Promise<void> {
    logger.info(
      {
        alertId: notification.alertId,
        alertName: notification.alertName,
        symbol: notification.symbol,
        observedValue: notification.observedValue,
        triggeredAt: notification.triggeredAt.toISOString(),
        channel: "log",
      },
      `Alert triggered: ${notification.message}`,
    );
  }
}

class NullNotificationProvider implements NotificationProvider {
  readonly name = "none";
  readonly enabled = false;

  async send(): Promise<void> {
    // Intentionally does nothing; the alert event row is still persisted.
  }
}

let provider: NotificationProvider | null = null;

export function getNotificationProvider(): NotificationProvider {
  if (provider) return provider;
  provider =
    env.ALERT_NOTIFICATION_CHANNEL === "none"
      ? new NullNotificationProvider()
      : new LogNotificationProvider();
  return provider;
}

export function setNotificationProvider(next: NotificationProvider | null): void {
  provider = next;
}
