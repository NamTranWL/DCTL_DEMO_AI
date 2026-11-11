import { Logger } from '@nestjs/common';
import {
  type DeliveryResult,
  NotificationChannel,
  type OutboundNotification,
} from '../notification.types';
import { type NotificationSender } from './notification-sender';

/**
 * Development sender: writes the notification to the log instead of delivering it
 * (`MAIL_PROVIDER=console` / `PUSH_PROVIDER=console`).
 */
export class ConsoleSender implements NotificationSender {
  readonly provider = 'console';
  private readonly logger: Logger;

  constructor(readonly channel: NotificationChannel) {
    this.logger = new Logger(`ConsoleSender:${channel}`);
  }

  send(notification: OutboundNotification): Promise<DeliveryResult> {
    const targets =
      this.channel === NotificationChannel.Email
        ? notification.recipient.email
          ? [notification.recipient.email]
          : []
        : notification.recipient.pushTokens;
    if (targets.length === 0) {
      return Promise.resolve(this.result(0, true));
    }
    this.logger.log(
      `→ ${targets.join(', ')} | ${notification.title} — ${notification.body}` +
        (notification.data ? ` ${JSON.stringify(notification.data)}` : ''),
    );
    return Promise.resolve(this.result(targets.length));
  }

  private result(delivered: number, skipped = false): DeliveryResult {
    return { channel: this.channel, provider: this.provider, delivered, failed: 0, skipped };
  }
}
