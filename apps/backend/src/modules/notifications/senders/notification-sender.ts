import {
  type DeliveryResult,
  type NotificationChannel,
  type OutboundNotification,
} from '../notification.types';

/**
 * Adapter for an external notification service (§10 Adapter pattern): Email (SMTP), Push
 * (Expo), or the console in development. Changing provider only means adding an implementation
 * and selecting it in `.env` — the dispatcher and business modules do not change (NFR §9).
 * Implementations throw on transient errors so the queue retries the job.
 */
export interface NotificationSender {
  readonly channel: NotificationChannel;
  /** Short provider name for logs/monitoring. */
  readonly provider: string;
  send(notification: OutboundNotification): Promise<DeliveryResult>;
}

/** DI token: the list of senders configured from env (one per channel). */
export const NOTIFICATION_SENDERS = Symbol('NOTIFICATION_SENDERS');
