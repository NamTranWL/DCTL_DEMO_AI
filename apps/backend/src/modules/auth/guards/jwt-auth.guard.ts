import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Response } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/auth.decorators';
import { type AuthenticatedRequest } from '../../../common/types/auth-user';
import { AccessTokenAuthenticator } from '../access-token.authenticator';

/** Header set when the token's role/familyId no longer match the database → client should refresh. */
export const TOKEN_STALE_HEADER = 'X-Token-Stale';

/**
 * Guard toàn cục: mọi endpoint cần access token hợp lệ, trừ endpoint gắn @Public().
 * Sau khi kiểm tra chữ ký, nạp lại người dùng từ DB và gắn vào request.user — vai trò và
 * family_id luôn lấy theo DB, nên người bị xoá khỏi gia đình hay bị khoá mất quyền ngay (BR-06).
 * @uc UC-AUTH-02  @fr FR-01  @br BR-06
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticator: AccessTokenAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      // WebSocket handshakes are authenticated by the realtime gateway middleware.
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const session = await this.authenticator.verify(
      extractBearerToken(request.headers.authorization),
    );
    if (session.stale) {
      http.getResponse<Response>().setHeader(TOKEN_STALE_HEADER, '1');
    }
    request.user = session.user;
    return true;
  }
}

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
