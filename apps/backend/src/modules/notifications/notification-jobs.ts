import { type NotificationChannel, type NotificationContent } from './notification.types';

/** Job names of the `notifications` queue. */
export const NOTIFICATION_JOBS = {
  /** Deliver one notification to one user on ONE channel. */
  SEND: 'notification.send',
} as const;

/**
 * Data of a `notification.send` job. One job per channel, so retrying a failed e-mail never
 * re-sends a push that already went out.
 */
export interface SendNotificationJobData extends NotificationContent {
  userId: string;
  channel: NotificationChannel;
}
