import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type AccessTokenPayload } from '../../common/types/auth-user';
import { jwtConfig, type JwtConfig } from '../../config/configuration';
import { type User } from '../users/entities/user.entity';
import { type AuthTokensResponse } from './dto/auth.dto';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

const MS_PER_DAY = 86_400_000;
const REFRESH_TOKEN_BYTES = 48;

/** Token subject needed to sign claims. */
export type TokenSubject = Pick<User, 'id' | 'role' | 'familyId'>;

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Cấp và kiểm tra token: access token JWT (HS256, payload {sub, role, familyId}) và
 * refresh token mờ (lưu hash, xoay vòng mỗi lần dùng, phát hiện dùng lại).
 * @uc UC-AUTH-02  @fr FR-01
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(jwtConfig.KEY) private readonly config: JwtConfig,
  ) {}

  /** Cấp cặp token mới cho người dùng. @uc UC-AUTH-01, UC-AUTH-02  @fr FR-01 */
  async issueTokens(user: TokenSubject, now: Date = new Date()): Promise<AuthTokensResponse> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      familyId: user.familyId,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.accessTtlSeconds,
    });

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const refreshExpiresAt = new Date(now.getTime() + this.config.refreshTtlDays * MS_PER_DAY);
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        revokedAt: null,
      }),
    );

    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: this.config.accessTtlSeconds,
      refreshToken,
      refreshExpiresAt,
    };
  }

  /** Giải mã và kiểm tra access token; lỗi → 401 AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID. */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('missing sub');
      }
      return payload;
    } catch (error: unknown) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppException(
        expired ? ErrorCode.TokenExpired : ErrorCode.TokenInvalid,
        undefined,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Dùng refresh token: thu hồi token cũ và trả về userId để cấp cặp mới (rotation).
   * Token đã thu hồi mà bị dùng lại → nghi lộ token → thu hồi toàn bộ phiên của người đó.
   * @uc UC-AUTH-02  @fr FR-01
   */
  async consumeRefreshToken(raw: string, now: Date = new Date()): Promise<string> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(raw));
    if (!stored) {
      throw this.invalidRefreshToken();
    }
    if (stored.revokedAt !== null) {
      await this.refreshTokens.revokeAllForUser(stored.userId, now);
      throw this.invalidRefreshToken();
    }
    if (!stored.isActive(now)) {
      throw this.invalidRefreshToken();
    }
    stored.revoke(now);
    await this.refreshTokens.save(stored);
    return stored.userId;
  }

  /** Thu hồi một refresh token (đăng xuất); token lạ/đã thu hồi được bỏ qua. */
  async revokeRefreshToken(raw: string, now: Date = new Date()): Promise<void> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(raw));
    if (stored?.revokedAt === null) {
      stored.revoke(now);
      await this.refreshTokens.save(stored);
    }
  }

  /** Thu hồi mọi phiên của người dùng (đổi mật khẩu, khoá tài khoản). */
  revokeAllForUser(userId: string): Promise<number> {
    return this.refreshTokens.revokeAllForUser(userId);
  }

  private invalidRefreshToken(): AppException {
    return new AppException(ErrorCode.RefreshTokenInvalid, undefined, HttpStatus.UNAUTHORIZED);
  }
}
