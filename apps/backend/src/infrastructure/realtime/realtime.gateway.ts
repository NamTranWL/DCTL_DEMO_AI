import { familyRoom, REALTIME_EVENTS, REALTIME_NAMESPACE, userRoom } from '@dctl/shared';
import { Inject, Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { isRecord } from '../../common/utils/http-error.util';
import { REALTIME_AUTHENTICATOR, type RealtimeAuthenticator } from './realtime-authenticator';
import { type RealtimeNamespace, type RealtimeSocket } from './realtime.types';

/** Error passed to `next()` in a Socket.IO middleware; the client sees it in `connect_error`. */
export interface HandshakeError extends Error {
  data: { code: string; message: string };
}

/**
 * Read the access token from the handshake: `auth.token` (socket.io-client `auth` option,
 * preferred) or an `Authorization: Bearer` header (tools, web).
 */
export function handshakeToken(socket: Pick<RealtimeSocket, 'handshake'>): string | null {
  const auth: unknown = socket.handshake.auth;
  if (isRecord(auth) && typeof auth.token === 'string' && auth.token.length > 0) {
    return auth.token.replace(/^Bearer\s+/i, '');
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && /^Bearer\s+\S+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, '');
  }
  return null;
}

function toHandshakeError(error: unknown): HandshakeError {
  const body = error instanceof AppException ? error.getResponse() : null;
  const code = isRecord(body) && typeof body.code === 'string' ? body.code : ErrorCode.TokenInvalid;
  const message =
    isRecord(body) && typeof body.message === 'string'
      ? body.message
      : 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.';
  return Object.assign(new Error(code), { data: { code, message } });
}

/**
 * Cổng realtime Socket.IO (namespace `/realtime`). Khi bắt tay: xác thực JWT (từ chối kết nối
 * nếu token thiếu/sai/hết hạn hoặc tài khoản bị khoá), rồi tự vào room `user:{id}` và
 * `family:{familyId}` — sự kiện gia đình chỉ phát trong room của chính gia đình đó (BR-06).
 * Không nhận lệnh từ client: app thay đổi dữ liệu qua REST rồi nhận broadcast.
 * @uc UC-SHOP-02, UC-SHOP-03  @fr FR-06, FR-07  @br BR-06
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE, cors: { origin: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private namespaceRef: RealtimeNamespace | null = null;

  constructor(
    @Inject(REALTIME_AUTHENTICATOR) private readonly authenticator: RealtimeAuthenticator,
  ) {}

  /** The Socket.IO namespace, or null before the WebSocket adapter is initialized. */
  get namespace(): RealtimeNamespace | null {
    return this.namespaceRef;
  }

  /** Đăng ký middleware xác thực JWT cho mọi kết nối mới. @br BR-06 */
  afterInit(namespace: RealtimeNamespace): void {
    this.namespaceRef = namespace;
    namespace.use((socket, next) => {
      this.authenticator
        .authenticate(handshakeToken(socket))
        .then((user) => {
          socket.data.user = user;
          next();
        })
        .catch((error: unknown) => next(toHandshakeError(error)));
    });
  }

  /** Vào room cá nhân và room gia đình, báo cho client đã sẵn sàng. @fr FR-06  @br BR-06 */
  async handleConnection(socket: RealtimeSocket): Promise<void> {
    const { user } = socket.data;
    const rooms = [userRoom(user.id), ...(user.familyId ? [familyRoom(user.familyId)] : [])];
    await socket.join(rooms);
    socket.emit(REALTIME_EVENTS.SYSTEM_READY, { userId: user.id, familyId: user.familyId, rooms });
    this.logger.debug(`connected ${socket.id} user=${user.id} rooms=${rooms.join(',')}`);
  }

  handleDisconnect(socket: RealtimeSocket): void {
    this.logger.debug(`disconnected ${socket.id}`);
  }
}
