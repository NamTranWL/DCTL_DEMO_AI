import { type Transporter } from 'nodemailer';
import {
  type DeliveryResult,
  NotificationChannel,
  type OutboundNotification,
} from '../notification.types';
import { type NotificationSender } from './notification-sender';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Minimal HTML layout for notification e-mails (content is escaped). */
export function renderEmailHtml(title: string, body: string): string {
  const paragraphs = body
    .split('\n')
    .map((line) => `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`)
    .join('');
  return (
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">' +
    `<h2 style="color:#2e7d32;margin:0 0 12px">${escapeHtml(title)}</h2>${paragraphs}` +
    '<p style="color:#888;font-size:12px;margin-top:24px">Đi chợ Tiện lợi</p></div>'
  );
}

/**
 * Email adapter over nodemailer SMTP (`MAIL_PROVIDER=smtp`; dev: MailHog localhost:1025,
 * xem thư tại http://localhost:8025).
 * @uc UC-FRIDGE-04  @fr FR-10
 */
export class EmailSender implements NotificationSender {
  readonly channel = NotificationChannel.Email;
  readonly provider = 'smtp';

  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async send(notification: OutboundNotification): Promise<DeliveryResult> {
    const to = notification.recipient.email;
    if (!to) {
      return {
        channel: this.channel,
        provider: this.provider,
        delivered: 0,
        failed: 0,
        skipped: true,
      };
    }
    // Errors (SMTP down, timeout) propagate → BullMQ retries the job.
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: notification.title,
      text: notification.body,
      html: renderEmailHtml(notification.title, notification.body),
    });
    return { channel: this.channel, provider: this.provider, delivered: 1, failed: 0 };
  }
}
