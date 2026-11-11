import { type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { createTransport } from 'nodemailer';
import { NotificationChannel, type OutboundNotification } from '../notification.types';
import { ConsoleSender } from './console.sender';
import { EmailSender, escapeHtml, renderEmailHtml } from './email.sender';
import { type ExpoPushClient, ExpoPushSender } from './expo-push.sender';
import { createNotificationSenders } from './notification-senders.provider';

const VALID_TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const GONE_TOKEN = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

function notification(
  overrides: Partial<OutboundNotification['recipient']> = {},
): OutboundNotification {
  return {
    recipient: {
      userId: 'u1',
      email: 'noitro@dctl.local',
      pushTokens: [VALID_TOKEN],
      ...overrides,
    },
    title: 'Sắp hết hạn',
    body: 'Thịt ba chỉ còn 2 ngày <hết hạn>',
    data: { type: 'EXPIRY_SOON' },
  };
}

describe('ConsoleSender', () => {
  it('logs and counts recipients of its channel; skips when there is none', async () => {
    const email = new ConsoleSender(NotificationChannel.Email);
    const push = new ConsoleSender(NotificationChannel.Push);

    await expect(email.send(notification())).resolves.toMatchObject({ delivered: 1 });
    await expect(push.send(notification({ pushTokens: [] }))).resolves.toMatchObject({
      delivered: 0,
      skipped: true,
    });
  });
});

describe('EmailSender (nodemailer)', () => {
  it('sends text + escaped HTML through the transport', async () => {
    const transport = createTransport({ jsonTransport: true });
    const spy = jest.spyOn(transport, 'sendMail');
    const sender = new EmailSender(transport, 'Đi chợ <no-reply@dctl.local>');

    const result = await sender.send(notification());

    expect(result).toMatchObject({ channel: NotificationChannel.Email, delivered: 1 });
    const mail = spy.mock.calls[0]?.[0];
    expect(mail).toMatchObject({ to: 'noitro@dctl.local', subject: 'Sắp hết hạn' });
    expect(mail?.html).toContain('&lt;hết hạn&gt;');
  });

  it('skips a recipient without e-mail', async () => {
    const sender = new EmailSender(createTransport({ jsonTransport: true }), 'x@y.z');

    await expect(sender.send(notification({ email: null }))).resolves.toMatchObject({
      skipped: true,
    });
  });

  it('propagates transport errors so the job is retried', async () => {
    const transport = createTransport({ jsonTransport: true });
    jest.spyOn(transport, 'sendMail').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(new EmailSender(transport, 'x@y.z').send(notification())).rejects.toThrow(
      'ECONNREFUSED',
    );
  });

  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
    expect(renderEmailHtml('T', 'a\nb')).toContain('<p style="margin:0 0 8px">b</p>');
  });
});

describe('ExpoPushSender', () => {
  function fakeClient(tickets: ExpoPushTicket[]): ExpoPushClient & { sent: ExpoPushMessage[] } {
    const sent: ExpoPushMessage[] = [];
    return {
      sent,
      chunkPushNotifications: (messages: ExpoPushMessage[]) => [messages],
      sendPushNotificationsAsync: (messages: ExpoPushMessage[]) => {
        sent.push(...messages);
        return Promise.resolve(tickets.slice(0, messages.length));
      },
    };
  }

  it('sends to valid tokens and reports DeviceNotRegistered + malformed tokens as invalid', async () => {
    const client = fakeClient([
      { status: 'ok', id: 't1' },
      {
        status: 'error',
        message: 'not registered',
        details: { error: 'DeviceNotRegistered' },
      },
    ]);
    const sender = new ExpoPushSender(client);

    const result = await sender.send(
      notification({ pushTokens: [VALID_TOKEN, GONE_TOKEN, 'not-a-token'] }),
    );

    expect(client.sent.map((m) => m.to)).toEqual([VALID_TOKEN, GONE_TOKEN]);
    expect(client.sent[0]).toMatchObject({ title: 'Sắp hết hạn', data: { type: 'EXPIRY_SOON' } });
    expect(result).toMatchObject({ delivered: 1, failed: 2 });
    expect(result.invalidPushTokens?.sort()).toEqual([GONE_TOKEN, 'not-a-token'].sort());
  });

  it('skips a user without push tokens', async () => {
    const result = await new ExpoPushSender(fakeClient([])).send(notification({ pushTokens: [] }));

    expect(result).toMatchObject({ delivered: 0, skipped: true });
  });
});

describe('createNotificationSenders — provider selected by env', () => {
  const base = {
    push: { provider: 'console' as const, expoAccessToken: '' },
    mail: {
      provider: 'console' as const,
      host: 'localhost',
      port: 1025,
      secure: false,
      user: '',
      password: '',
      from: 'x@y.z',
    },
  };

  it('console/console → two console senders', () => {
    expect(createNotificationSenders(base).map((s) => [s.channel, s.provider])).toEqual([
      [NotificationChannel.Email, 'console'],
      [NotificationChannel.Push, 'console'],
    ]);
  });

  it('smtp/expo → EmailSender + ExpoPushSender', () => {
    const senders = createNotificationSenders({
      push: { provider: 'expo', expoAccessToken: '' },
      mail: { ...base.mail, provider: 'smtp' },
    });

    expect(senders.map((s) => s.provider)).toEqual(['smtp', 'expo']);
  });
});
