import { type Provider } from '@nestjs/common';
import { Expo } from 'expo-server-sdk';
import { createTransport } from 'nodemailer';
import { notificationConfig, type NotificationConfig } from '../../../config/configuration';
import { NotificationChannel } from '../notification.types';
import { ConsoleSender } from './console.sender';
import { EmailSender } from './email.sender';
import { ExpoPushSender } from './expo-push.sender';
import { NOTIFICATION_SENDERS, type NotificationSender } from './notification-sender';

/**
 * Build the senders selected in `.env`:
 *   MAIL_PROVIDER=smtp → EmailSender (nodemailer) · console → ConsoleSender
 *   PUSH_PROVIDER=expo → ExpoPushSender            · console → ConsoleSender
 */
export function createNotificationSenders(config: NotificationConfig): NotificationSender[] {
  const email =
    config.mail.provider === 'smtp'
      ? new EmailSender(
          createTransport({
            host: config.mail.host,
            port: config.mail.port,
            secure: config.mail.secure,
            auth: config.mail.user
              ? { user: config.mail.user, pass: config.mail.password }
              : undefined,
          }),
          config.mail.from,
        )
      : new ConsoleSender(NotificationChannel.Email);

  const push =
    config.push.provider === 'expo'
      ? new ExpoPushSender(new Expo({ accessToken: config.push.expoAccessToken || undefined }))
      : new ConsoleSender(NotificationChannel.Push);

  return [email, push];
}

export const notificationSendersProvider: Provider = {
  provide: NOTIFICATION_SENDERS,
  inject: [notificationConfig.KEY],
  useFactory: createNotificationSenders,
};
