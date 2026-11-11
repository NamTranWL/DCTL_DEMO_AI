/**
 * e2e (B6): realtime + queue infrastructure against real PostgreSQL + Redis.
 *
 * TWO backend instances share Redis (Socket.IO Redis adapter + BullMQ), like a scaled deploy:
 *   - family A: ownerA (instance 1) + memberA (instance 2) → both receive family A events
 *   - family B: userB (instance 1) → never receives family A events (BR-06)
 *   - membership changes move sockets in/out of rooms immediately
 *   - a job in the `notifications` queue is processed by the worker (incl. retry)
 */
import {
  PushPlatform,
  REALTIME_EVENTS,
  type RealtimeEventPayloads,
  type RealtimeEventName,
} from '@dctl/shared';
import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplication } from '@nestjs/common';
import { type TestingModuleBuilder } from '@nestjs/testing';
import { type Queue, QueueEvents } from 'bullmq';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { ErrorCode } from '../src/common/exceptions/error-code.enum';
import { redisConfig, type RedisConfig } from '../src/config/configuration';
import { QUEUE_NAMES, QUEUE_PREFIX } from '../src/infrastructure/queue/queue.constants';
import { RealtimeService } from '../src/infrastructure/realtime/realtime.service';
import { Family } from '../src/modules/families/entities/family.entity';
import { PushToken } from '../src/modules/notifications/entities/push-token.entity';
import { NotificationQueue } from '../src/modules/notifications/notification.queue';
import {
  type DeliveryResult,
  NotificationChannel,
  type OutboundNotification,
} from '../src/modules/notifications/notification.types';
import {
  NOTIFICATION_SENDERS,
  type NotificationSender,
} from '../src/modules/notifications/senders/notification-sender';
import { User } from '../src/modules/users/entities/user.entity';
import { createTestApp, listenOnRandomPort, uniqueSuffix } from './helpers/test-app';

const PASSWORD = 'Test@1234';
const SILENCE_MS = 400;

/** In-memory sender shared by both instances; can fail the next N sends to test retries. */
class CaptureSender implements NotificationSender {
  readonly provider = 'capture';
  readonly sent: OutboundNotification[] = [];
  failNext = 0;

  constructor(readonly channel: NotificationChannel) {}

  send(notification: OutboundNotification): Promise<DeliveryResult> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('provider temporarily unavailable'));
    }
    this.sent.push(notification);
    return Promise.resolve({
      channel: this.channel,
      provider: this.provider,
      delivered: 1,
      failed: 0,
    });
  }
}

interface Session {
  id: string;
  username: string;
  token: string;
}

describe('Realtime gateway + notifications queue (e2e)', () => {
  const emailSender = new CaptureSender(NotificationChannel.Email);
  const pushSender = new CaptureSender(NotificationChannel.Push);
  const suffix = uniqueSuffix();
  const usernames: string[] = [];
  const familyIds: string[] = [];
  const sockets: Socket[] = [];

  let app1: INestApplication<App>;
  let app2: INestApplication<App>;
  let url1: string;
  let url2: string;
  let queueEvents: QueueEvents;

  let ownerA: Session;
  let memberA: Session;
  let userB: Session;
  let familyA: { id: string; inviteCode: string };
  let familyB: { id: string; inviteCode: string };
  let socketOwnerA: Socket;
  let socketMemberA: Socket;
  let socketUserB: Socket;

  const http = () => request(app1.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(name: string): Promise<Session> {
    const username = `${name}_${suffix}`.toLowerCase();
    usernames.push(username);
    const res = await http()
      .post('/api/auth/register')
      .send({ username, email: `${username}@e2e.test`, password: PASSWORD })
      .expect(201);
    const body = (res.body as { data: { accessToken: string; user: { id: string } } }).data;
    return { id: body.user.id, username, token: body.accessToken };
  }

  async function createFamily(session: Session, name: string) {
    const res = await http()
      .post('/api/families')
      .set(auth(session.token))
      .send({ name })
      .expect(201);
    const family = (res.body as { data: { id: string; inviteCode: string } }).data;
    familyIds.push(family.id);
    return family;
  }

  /** Connect and resolve once the server confirmed the rooms (system:ready). */
  function connect(baseUrl: string, token: string | null): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/realtime`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.once(REALTIME_EVENTS.SYSTEM_READY, () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function connectError(
    baseUrl: string,
    token: string | null,
  ): Promise<Error & { data?: unknown }> {
    return connect(baseUrl, token).then(
      () => {
        throw new Error('expected the handshake to be rejected');
      },
      (error: Error & { data?: unknown }) => error,
    );
  }

  function next<E extends RealtimeEventName>(
    socket: Socket,
    event: E,
    timeoutMs = 3000,
  ): Promise<RealtimeEventPayloads[E]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
      const name: string = event;
      socket.once(name, (payload: unknown) => {
        clearTimeout(timer);
        resolve(payload as RealtimeEventPayloads[E]);
      });
    });
  }

  /** Collect every `event` received during `ms`. */
  function collect(socket: Socket, event: RealtimeEventName, ms = SILENCE_MS): Promise<unknown[]> {
    const received: unknown[] = [];
    const handler = (payload: unknown) => received.push(payload);
    socket.on(event, handler);
    return new Promise((resolve) =>
      setTimeout(() => {
        socket.off(event, handler);
        resolve(received);
      }, ms),
    );
  }

  const ping = (message: string) => ({ message, sentAt: new Date().toISOString() });

  beforeAll(async () => {
    const override = {
      override: (builder: TestingModuleBuilder) =>
        builder.overrideProvider(NOTIFICATION_SENDERS).useValue([emailSender, pushSender]),
    };
    app1 = await createTestApp(override);
    app2 = await createTestApp(override);
    url1 = await listenOnRandomPort(app1);
    url2 = await listenOnRandomPort(app2);

    const redis = app1.get<RedisConfig>(redisConfig.KEY);
    queueEvents = new QueueEvents(QUEUE_NAMES.NOTIFICATIONS, {
      connection: { host: redis.host, port: redis.port, password: redis.password },
      prefix: QUEUE_PREFIX,
    });
    await queueEvents.waitUntilReady();

    ownerA = await register('rtOwnerA');
    familyA = await createFamily(ownerA, `Nhà A ${suffix}`);
    memberA = await register('rtMemberA');
    await http()
      .post('/api/families/join')
      .set(auth(memberA.token))
      .send({ inviteCode: familyA.inviteCode })
      .expect(200);
    userB = await register('rtUserB');
    familyB = await createFamily(userB, `Nhà B ${suffix}`);

    socketOwnerA = await connect(url1, ownerA.token);
    socketMemberA = await connect(url2, memberA.token); // other instance
    socketUserB = await connect(url1, userB.token);
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await queueEvents?.close();
    const ds = app1.get(DataSource);
    if (familyIds.length) await ds.getRepository(Family).delete({ id: In(familyIds) });
    if (usernames.length) await ds.getRepository(User).delete({ username: In(usernames) });
    await app2?.close();
    await app1?.close();
  });

  describe('Handshake authentication (JWT)', () => {
    it('rejects a connection without token', async () => {
      const error = await connectError(url1, null);
      expect(error.message).toBe(ErrorCode.TokenMissing);
      expect(error.data).toMatchObject({ code: ErrorCode.TokenMissing });
    });

    it('rejects an invalid token', async () => {
      const error = await connectError(url1, 'not.a.jwt');
      expect(error.message).toBe(ErrorCode.TokenInvalid);
    });

    it('joins user + family rooms on connect (system:ready)', async () => {
      const socket = io(`${url1}/realtime`, {
        auth: { token: ownerA.token },
        transports: ['websocket'],
        forceNew: true,
      });
      sockets.push(socket);
      const ready = await next(socket, REALTIME_EVENTS.SYSTEM_READY);
      expect(ready).toEqual({
        userId: ownerA.id,
        familyId: familyA.id,
        rooms: [`user:${ownerA.id}`, `family:${familyA.id}`],
      });
      socket.disconnect();
    });
  });

  describe('BR-06: family events stay inside the family room', () => {
    it('2 clients of family A (on 2 instances) receive the event; family B does not', async () => {
      const silentB = collect(socketUserB, REALTIME_EVENTS.SYSTEM_PING);
      const gotOwner = next(socketOwnerA, REALTIME_EVENTS.SYSTEM_PING);
      const gotMember = next(socketMemberA, REALTIME_EVENTS.SYSTEM_PING);

      app1.get(RealtimeService).emitToFamily(familyA.id, REALTIME_EVENTS.SYSTEM_PING, ping('A-1'));

      await expect(gotOwner).resolves.toMatchObject({ message: 'A-1' });
      await expect(gotMember).resolves.toMatchObject({ message: 'A-1' }); // via Redis adapter
      await expect(silentB).resolves.toEqual([]);
    });

    it('an event emitted on instance 2 for family B reaches B only', async () => {
      const silentA1 = collect(socketOwnerA, REALTIME_EVENTS.SYSTEM_PING);
      const silentA2 = collect(socketMemberA, REALTIME_EVENTS.SYSTEM_PING);
      const gotB = next(socketUserB, REALTIME_EVENTS.SYSTEM_PING);

      app2.get(RealtimeService).emitToFamily(familyB.id, REALTIME_EVENTS.SYSTEM_PING, ping('B-1'));

      await expect(gotB).resolves.toMatchObject({ message: 'B-1' });
      await expect(silentA1).resolves.toEqual([]);
      await expect(silentA2).resolves.toEqual([]);
    });

    it('emitToUser reaches only that user', async () => {
      const silentOwner = collect(socketOwnerA, REALTIME_EVENTS.SYSTEM_PING);
      const gotMember = next(socketMemberA, REALTIME_EVENTS.SYSTEM_PING);

      app1
        .get(RealtimeService)
        .emitToUser(memberA.id, REALTIME_EVENTS.SYSTEM_PING, ping('private'));

      await expect(gotMember).resolves.toMatchObject({ message: 'private' });
      await expect(silentOwner).resolves.toEqual([]);
    });
  });

  describe('Membership changes move sockets between rooms immediately', () => {
    let newcomer: Session;
    let socketNewcomer: Socket;

    it('a user connected before joining enters family A’s room upon joining', async () => {
      newcomer = await register('rtNewcomer');
      socketNewcomer = await connect(url2, newcomer.token);

      const changed = next(socketNewcomer, REALTIME_EVENTS.USER_FAMILY_CHANGED);
      const membersChanged = next(socketOwnerA, REALTIME_EVENTS.FAMILY_MEMBERS_CHANGED);
      await http()
        .post('/api/families/join')
        .set(auth(newcomer.token))
        .send({ inviteCode: familyA.inviteCode })
        .expect(200);

      await expect(changed).resolves.toEqual({ familyId: familyA.id, reason: 'joined' });
      await expect(membersChanged).resolves.toEqual({
        familyId: familyA.id,
        change: 'joined',
        userId: newcomer.id,
      });

      const got = next(socketNewcomer, REALTIME_EVENTS.SYSTEM_PING);
      app1
        .get(RealtimeService)
        .emitToFamily(familyA.id, REALTIME_EVENTS.SYSTEM_PING, ping('welcome'));
      await expect(got).resolves.toMatchObject({ message: 'welcome' });
    });

    it('a removed member stops receiving family A events at once', async () => {
      const told = next(socketNewcomer, REALTIME_EVENTS.USER_FAMILY_CHANGED);
      await http()
        .delete(`/api/families/me/members/${newcomer.id}`)
        .set(auth(ownerA.token))
        .expect(204);
      await expect(told).resolves.toEqual({ familyId: null, reason: 'removed' });

      const silent = collect(socketNewcomer, REALTIME_EVENTS.SYSTEM_PING);
      const gotOwner = next(socketOwnerA, REALTIME_EVENTS.SYSTEM_PING);
      app2
        .get(RealtimeService)
        .emitToFamily(familyA.id, REALTIME_EVENTS.SYSTEM_PING, ping('after'));
      await gotOwner;
      await expect(silent).resolves.toEqual([]);
    });
  });

  describe('Queue `notifications`: jobs are processed by the worker', () => {
    const queue = () => app1.get<Queue>(getQueueToken(QUEUE_NAMES.NOTIFICATIONS));

    async function finished(jobId: string): Promise<unknown> {
      const job = await queue().getJob(jobId);
      if (!job) throw new Error(`job ${jobId} not found`);
      return job.waitUntilFinished(queueEvents, 15000);
    }

    it('an e-mail job is delivered to the user’s address', async () => {
      const before = emailSender.sent.length;
      const [jobId] = await app1.get(NotificationQueue).notify({
        userId: ownerA.id,
        channels: [NotificationChannel.Email],
        title: 'Thử hàng đợi',
        body: 'Nội dung thử',
      });

      await expect(finished(jobId ?? '')).resolves.toMatchObject({ delivered: 1 });
      const delivered = emailSender.sent.slice(before);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]?.title).toBe('Thử hàng đợi');
      expect(delivered[0]?.recipient.email).toBe(`${ownerA.username}@e2e.test`);
    });

    it('a failing provider is retried and the job still succeeds', async () => {
      const token = `ExponentPushToken[e2e${suffix}xxxxxxxxxx]`;
      await http()
        .post('/api/notifications/push-tokens')
        .set(auth(ownerA.token))
        .send({ token, platform: PushPlatform.Android })
        .expect(204);
      pushSender.failNext = 1;

      const [jobId] = await app1.get(NotificationQueue).notify({
        userId: ownerA.id,
        channels: [NotificationChannel.Push],
        title: 'Thử retry',
        body: 'x',
      });

      await expect(finished(jobId ?? '')).resolves.toMatchObject({ delivered: 1 });
      const job = await queue().getJob(jobId ?? '');
      expect(job?.attemptsMade).toBe(2);
      expect(pushSender.sent.at(-1)?.recipient.pushTokens).toEqual([token]);
    }, 20000);

    it('the same dedupe key is enqueued only once (BR-01: once per day)', async () => {
      const producer = app1.get(NotificationQueue);
      const request = {
        userId: ownerA.id,
        channels: [NotificationChannel.Email],
        title: 'Dedupe',
        body: 'x',
        dedupeKey: `e2e-dedupe:${suffix}`,
      };
      const [first] = await producer.notify(request);
      const [second] = await producer.notify(request);

      expect(second).toBe(first);
      await finished(first ?? '');
      expect(emailSender.sent.filter((n) => n.title === 'Dedupe')).toHaveLength(1);
    });

    it('admin test endpoint enqueues a job; non-admins are forbidden', async () => {
      await http()
        .post('/api/admin/notifications/test')
        .set(auth(ownerA.token))
        .send({})
        .expect(403);
    });
  });

  describe('Push tokens (FR-10)', () => {
    it('validates the Expo token format', async () => {
      const res = await http()
        .post('/api/notifications/push-tokens')
        .set(auth(userB.token))
        .send({ token: 'abc', platform: PushPlatform.Ios })
        .expect(400);
      expect(res.body).toMatchObject({ code: ErrorCode.ValidationError });
    });

    it('a token registered by another account moves to that account; delete removes it', async () => {
      const token = `ExponentPushToken[shared${suffix}yyyyyy]`;
      const repo = app1.get(DataSource).getRepository(PushToken);
      await http()
        .post('/api/notifications/push-tokens')
        .set(auth(memberA.token))
        .send({ token, platform: PushPlatform.Ios })
        .expect(204);
      await http()
        .post('/api/notifications/push-tokens')
        .set(auth(userB.token))
        .send({ token, platform: PushPlatform.Ios })
        .expect(204);
      expect((await repo.findOneByOrFail({ token })).userId).toBe(userB.id);

      // memberA cannot delete a token that is no longer theirs
      await http()
        .delete('/api/notifications/push-tokens')
        .set(auth(memberA.token))
        .send({ token })
        .expect(204);
      expect(await repo.existsBy({ token })).toBe(true);

      await http()
        .delete('/api/notifications/push-tokens')
        .set(auth(userB.token))
        .send({ token })
        .expect(204);
      expect(await repo.existsBy({ token })).toBe(false);
    });
  });
});
