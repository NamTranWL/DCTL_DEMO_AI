import { UserStatus } from '@dctl/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type AccessTokenPayload, type AuthUser } from '../../common/types/auth-user';
import { type RealtimeAuthenticator } from '../../infrastructure/realtime/realtime-authenticator';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';

/** Verified token claims plus the user as currently stored in the database. */
export interface AuthenticatedSession {
  payload: AccessTokenPayload;
  user: AuthUser;
  /** True when role/familyId in the token no longer match the database. */
  stale: boolean;
}

/**
 * Xác thực access token cho cả REST (JwtAuthGuard) và handshake WebSocket (RealtimeGateway):
 * kiểm tra chữ ký/hạn, nạp lại người dùng từ DB, chặn tài khoản bị khoá. family_id và vai trò
 * luôn lấy theo DB (BR-06).
 * @uc UC-AUTH-02  @fr FR-01, FR-07  @br BR-06
 */
@Injectable()
export class AccessTokenAuthenticator implements RealtimeAuthenticator {
  constructor(
    private readonly tokens: TokenService,
    private readonly usersService: UsersService,
  ) {}

  /** Xác thực token và trả về phiên đăng nhập (kèm cờ token đã cũ). */
  async verify(token: string | null): Promise<AuthenticatedSession> {
    if (!token) {
      throw new AppException(ErrorCode.TokenMissing, undefined, HttpStatus.UNAUTHORIZED);
    }
    const payload = await this.tokens.verifyAccessToken(token);
    const user = await this.usersService.findAuthUser(payload.sub);
    if (!user) {
      throw new AppException(ErrorCode.TokenInvalid, undefined, HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== UserStatus.Active) {
      throw new AppException(ErrorCode.AccountLocked, undefined, HttpStatus.FORBIDDEN);
    }
    const stale = payload.familyId !== user.familyId || payload.role !== user.role;
    return { payload, user, stale };
  }

  /** Xác thực handshake WebSocket. @uc UC-SHOP-02  @fr FR-06, FR-07  @br BR-06 */
  async authenticate(token: string | null): Promise<AuthUser> {
    return (await this.verify(token)).user;
  }
}
