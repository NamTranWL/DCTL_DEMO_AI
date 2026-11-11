import { Logger } from '@nestjs/common';
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import {
  type DeliveryResult,
  NotificationChannel,
  type OutboundNotification,
} from '../notification.types';
import { type NotificationSender } from './notification-sender';

/** The subset of the Expo SDK client used here (lets tests inject a fake). */
export type ExpoPushClient = Pick<Expo, 'chunkPushNotifications' | 'sendPushNotificationsAsync'>;

/**
 * Push adapter over the Expo push service (`PUSH_PROVIDER=expo`), matching the Expo app (B1).
 * Tokens reported as `DeviceNotRegistered` are returned as invalid so the dispatcher deletes
 * them. Delivery receipts (second phase of Expo push) are not polled in the base.
 * @uc UC-FRIDGE-04  @fr FR-10
 */
export class ExpoPushSender implements NotificationSender {
  readonly channel = NotificationChannel.Push;
  readonly provider = 'expo';
  private readonly logger = new Logger(ExpoPushSender.name);

  constructor(private readonly client: ExpoPushClient) {}

  async send(notification: OutboundNotification): Promise<DeliveryResult> {
    const tokens = notification.recipient.pushTokens;
    const valid: string[] = tokens.filter((token: string) => Expo.isExpoPushToken(token));
    const invalid: string[] = tokens.filter((token: string) => !Expo.isExpoPushToken(token));
    if (valid.length === 0) {
      return this.result(0, invalid.length, invalid, tokens.length === 0);
    }

    const messages: ExpoPushMessage[] = valid.map((to) => ({
      to,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default',
      priority: 'high',
    }));

    let delivered = 0;
    let failed = invalid.length;
    for (const chunk of this.client.chunkPushNotifications(messages)) {
      // Network/5xx errors propagate → BullMQ retries the job.
      const tickets: ExpoPushTicket[] = await this.client.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          delivered++;
          return;
        }
        failed++;
        const token = chunk[index]?.to;
        if (ticket.details?.error === 'DeviceNotRegistered' && typeof token === 'string') {
          invalid.push(token);
        }
        this.logger.warn(`Expo push error: ${ticket.message}`);
      });
    }
    return this.result(delivered, failed, invalid);
  }

  private result(
    delivered: number,
    failed: number,
    invalidPushTokens: string[],
    skipped = false,
  ): DeliveryResult {
    return {
      channel: this.channel,
      provider: this.provider,
      delivered,
      failed,
      invalidPushTokens,
      skipped,
    };
  }
}
