/** Delivery channels of a notification (FR-10: Push + Email). */
export enum NotificationChannel {
  Email = 'EMAIL',
  Push = 'PUSH',
}

/** Who receives a notification, resolved from the database by the dispatcher. */
export interface NotificationRecipient {
  userId: string;
  email: string | null;
  pushTokens: string[];
}

/** Content of a notification (Vietnamese, shown to the user). */
export interface NotificationContent {
  title: string;
  body: string;
  /** Extra data for the app (e.g. `{ type: 'EXPIRY_SOON', refId }`), push only. */
  data?: Record<string, string>;
}

export interface OutboundNotification extends NotificationContent {
  recipient: NotificationRecipient;
}

/** Outcome of one channel delivery. */
export interface DeliveryResult {
  channel: NotificationChannel;
  /** Implementation that handled it, e.g. "console", "smtp", "expo". */
  provider: string;
  delivered: number;
  failed: number;
  /** Push tokens the provider reported as no longer valid (to be deleted). */
  invalidPushTokens?: string[];
  /** True when the recipient has no address for this channel (nothing to send). */
  skipped?: boolean;
}
