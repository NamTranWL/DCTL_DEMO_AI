import { REALTIME_EVENTS, UserRole, UserStatus } from '@dctl/shared';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type AuthUser } from '../../common/types/auth-user';
import { type RealtimeAuthenticator } from './realtime-authenticator';
import { handshakeToken, type HandshakeError, RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { type RealtimeNamespace, type RealtimeSocket } from './realtime.types';

const user: AuthUser = {
  id: 'u1',
  username: 'noitro',
  role: UserRole.Homemaker,
  status: UserStatus.Active,
  familyId: 'fam-a',
};

type Middleware = (socket: RealtimeSocket, next: (error?: Error) => void) => void;

function fakeNamespace() {
  const calls: { op: string; room: string; args: unknown[] }[] = [];
  let middleware: Middleware | undefined;
  const operator = (room: string) => ({
    emit: (...args: unknown[]) => calls.push({ op: 'emit', room, args }),
    socketsJoin: (target: string) => calls.push({ op: 'join', room, args: [target] }),
    socketsLeave: (target: string) => calls.push({ op: 'leave', room, args: [target] }),
    disconnectSockets: () => calls.push({ op: 'disconnect', room, args: [] }),
  });
  const namespace = {
    use: (fn: Middleware) => {
      middleware = fn;
    },
    to: operator,
    in: operator,
  } as unknown as RealtimeNamespace;
  return { namespace, calls, middleware: () => middleware };
}

function socket(auth: unknown, headers: Record<string, string> = {}) {
  const joined: string[] = [];
  const emitted: unknown[][] = [];
  return {
    id: 's1',
    handshake: { auth, headers },
    data: {} as { user?: AuthUser },
    join: (rooms: string[]) => {
      joined.push(...rooms);
      return Promise.resolve();
    },
    emit: (...args: unknown[]) => emitted.push(args),
    joined,
    emitted,
  };
}

describe('handshakeToken', () => {
  it('reads auth.token first, then the Authorization header', () => {
    expect(handshakeToken(socket({ token: 'abc' }) as unknown as RealtimeSocket)).toBe('abc');
    expect(handshakeToken(socket({ token: 'Bearer abc' }) as unknown as RealtimeSocket)).toBe(
      'abc',
    );
    expect(
      handshakeToken(socket({}, { authorization: 'Bearer xyz' }) as unknown as RealtimeSocket),
    ).toBe('xyz');
    expect(handshakeToken(socket(undefined) as unknown as RealtimeSocket)).toBeNull();
  });
});

describe('RealtimeGateway — JWT handshake + rooms (BR-06)', () => {
  function gatewayWith(authenticate: RealtimeAuthenticator['authenticate']) {
    const gateway = new RealtimeGateway({ authenticate });
    const ns = fakeNamespace();
    gateway.afterInit(ns.namespace);
    return { gateway, ns };
  }

  async function runMiddleware(
    gateway: ReturnType<typeof gatewayWith>,
    s: ReturnType<typeof socket>,
  ) {
    return new Promise<Error | undefined>((resolve) =>
      gateway.ns.middleware()?.(s as unknown as RealtimeSocket, resolve),
    );
  }

  it('accepts a valid token and stores the user on the socket', async () => {
    const g = gatewayWith(() => Promise.resolve(user));
    const s = socket({ token: 'good' });

    await expect(runMiddleware(g, s)).resolves.toBeUndefined();
    expect(s.data.user).toEqual(user);
  });

  it('rejects with the AppException code and Vietnamese message', async () => {
    const g = gatewayWith(() =>
      Promise.reject(new AppException(ErrorCode.TokenExpired, undefined, HttpStatus.UNAUTHORIZED)),
    );

    const error = (await runMiddleware(g, socket({ token: 'old' }))) as HandshakeError;

    expect(error.message).toBe(ErrorCode.TokenExpired);
    expect(error.data).toEqual({
      code: ErrorCode.TokenExpired,
      message: 'Phiên đăng nhập đã hết hạn.',
    });
  });

  it('on connection joins user + family rooms and emits system:ready', async () => {
    const { gateway } = gatewayWith(() => Promise.resolve(user));
    const s = socket({ token: 'good' });
    s.data.user = user;

    await gateway.handleConnection(s as unknown as RealtimeSocket);

    expect(s.joined).toEqual(['user:u1', 'family:fam-a']);
    expect(s.emitted[0]).toEqual([
      REALTIME_EVENTS.SYSTEM_READY,
      { userId: 'u1', familyId: 'fam-a', rooms: ['user:u1', 'family:fam-a'] },
    ]);
  });

  it('a user without a family joins only their user room', async () => {
    const { gateway } = gatewayWith(() => Promise.resolve(user));
    const s = socket({ token: 'good' });
    s.data.user = { ...user, familyId: null };

    await gateway.handleConnection(s as unknown as RealtimeSocket);

    expect(s.joined).toEqual(['user:u1']);
  });
});

describe('RealtimeService', () => {
  it('emits only into the family room', () => {
    const gateway = new RealtimeGateway({ authenticate: () => Promise.resolve(user) });
    const ns = fakeNamespace();
    gateway.afterInit(ns.namespace);
    const service = new RealtimeService(gateway);

    service.emitToFamily('fam-a', REALTIME_EVENTS.SYSTEM_PING, { message: 'hi', sentAt: 'now' });

    expect(ns.calls).toEqual([
      {
        op: 'emit',
        room: 'family:fam-a',
        args: [REALTIME_EVENTS.SYSTEM_PING, { message: 'hi', sentAt: 'now' }],
      },
    ]);
  });

  it('moves every socket of a user in/out of the family room', () => {
    const gateway = new RealtimeGateway({ authenticate: () => Promise.resolve(user) });
    const ns = fakeNamespace();
    gateway.afterInit(ns.namespace);
    const service = new RealtimeService(gateway);

    service.joinFamilyRoom('u2', 'fam-a');
    service.leaveFamilyRoom('u2', 'fam-a');

    expect(ns.calls).toEqual([
      { op: 'join', room: 'user:u2', args: ['family:fam-a'] },
      { op: 'leave', room: 'user:u2', args: ['family:fam-a'] },
    ]);
  });

  it('does nothing (no throw) before the WebSocket server exists', () => {
    const service = new RealtimeService(
      new RealtimeGateway({ authenticate: () => Promise.resolve(user) }),
    );

    expect(() =>
      service.emitToUser('u1', REALTIME_EVENTS.SYSTEM_PING, { message: 'x', sentAt: 'y' }),
    ).not.toThrow();
    expect(() => service.joinFamilyRoom('u1', 'f')).not.toThrow();
  });
});
