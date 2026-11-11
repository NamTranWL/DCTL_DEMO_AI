import { type Job, type Queue, UnrecoverableError } from 'bullmq';
import { type UserRepository } from '../users/repositories/user.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NOTIFICATION_JOBS, type SendNotificationJobData } from './notification-jobs';
import { NotificationQueue } from './notification.queue';
import { NotificationChannel, type DeliveryResult } from './notification.types';
import { NotificationsProcessor } from './notifications.processor';
import { type PushTokenRepository } from './repositories/push-token.repository';
import { type NotificationSender } from './senders/notification-sender';

const job: SendNotificationJobData = {
  userId: 'u1',
  channel: NotificationChannel.Push,
  title: 'T',
  body: 'B',
};

function dispatcherWith(
  result: Partial<DeliveryResult>,
  user: object | null = { id: 'u1', email: 'a@b.vn' },
) {
  const sender: NotificationSender = {
    channel: NotificationChannel.Push,
    provider: 'fake',
    send: jest.fn(() =>
      Promise.resolve({
        channel: NotificationChannel.Push,
        provider: 'fake',
        delivered: 1,
        failed: 0,
        ...result,
      }),
    ),
  };
  const users = { findOne: jest.fn(() => Promise.resolve(user)) };
  const pushTokens = {
    tokensOf: jest.fn(() => Promise.resolve(['tok-1', 'tok-2'])),
    deleteTokens: jest.fn(() => Promise.resolve(1)),
  };
  const dispatcher = new NotificationDispatcher(
    [sender],
    users as unknown as UserRepository,
    pushTokens as unknown as PushTokenRepository,
  );
  return { dispatcher, sender, pushTokens };
}

describe('NotificationDispatcher — FR-10', () => {
  it('resolves the recipient from the database and sends through the channel adapter', async () => {
    const { dispatcher, sender } = dispatcherWith({});

    await dispatcher.deliver(job);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: { userId: 'u1', email: 'a@b.vn', pushTokens: ['tok-1', 'tok-2'] },
        title: 'T',
      }),
    );
  });

  it('deletes push tokens the provider reported as invalid', async () => {
    const { dispatcher, pushTokens } = dispatcherWith({ invalidPushTokens: ['tok-2'] });

    await dispatcher.deliver(job);

    expect(pushTokens.deleteTokens).toHaveBeenCalledWith(['tok-2']);
  });

  it('a missing user or channel is not retried (UnrecoverableError)', async () => {
    await expect(dispatcherWith({}, null).dispatcher.deliver(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    await expect(
      dispatcherWith({}).dispatcher.deliver({ ...job, channel: NotificationChannel.Email }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('NotificationQueue (producer)', () => {
  function queueWith() {
    let seq = 0;
    const add = jest.fn((_name: string, _data: SendNotificationJobData, opts: { jobId?: string }) =>
      Promise.resolve({ id: opts.jobId ?? String(++seq) }),
    );
    return {
      producer: new NotificationQueue({ add } as unknown as Queue<SendNotificationJobData>),
      add,
    };
  }

  it('enqueues one job per channel (no double sends on retry)', async () => {
    const { producer, add } = queueWith();

    await producer.notify({ userId: 'u1', title: 'T', body: 'B' });

    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls.map((call) => call[1].channel).sort()).toEqual([
      NotificationChannel.Email,
      NotificationChannel.Push,
    ]);
    expect(add.mock.calls[0]?.[0]).toBe(NOTIFICATION_JOBS.SEND);
  });

  it('derives deterministic job ids from the dedupe key (BR-01: once per day)', async () => {
    const { producer } = queueWith();

    const ids = await producer.notify({
      userId: 'u1',
      title: 'T',
      body: 'B',
      channels: [NotificationChannel.Email, NotificationChannel.Email],
      dedupeKey: 'expiry:item-1:2026-11-10',
    });

    expect(ids).toEqual(['expiry:item-1:2026-11-10:EMAIL']);
  });
});

describe('NotificationsProcessor', () => {
  it('routes notification.send to the dispatcher and rejects unknown jobs', async () => {
    const dispatcher = { deliver: jest.fn(() => Promise.resolve({ delivered: 1 })) };
    const processor = new NotificationsProcessor(dispatcher as unknown as NotificationDispatcher);

    await processor.process({
      name: NOTIFICATION_JOBS.SEND,
      data: job,
    } as Job<SendNotificationJobData>);
    expect(dispatcher.deliver).toHaveBeenCalledWith(job);

    await expect(
      processor.process({ name: 'unknown', data: job } as Job<SendNotificationJobData>),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
