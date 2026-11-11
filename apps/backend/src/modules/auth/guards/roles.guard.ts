import { type UserRole } from '@dctl/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/auth.decorators';
import { AppException } from '../../../common/exceptions/app.exception';
import { type AuthenticatedRequest } from '../../../common/types/auth-user';

/**
 * Guard toàn cục: endpoint gắn @Roles(...) chỉ cho phép các vai trò đã liệt kê (vai trò lấy
 * theo DB, do JwtAuthGuard nạp). Không gắn @Roles → mọi người dùng đã đăng nhập.
 * @uc UC-ADM-01, UC-FAM-01  @fr FR-03, FR-24
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !roles.includes(user.role)) {
      throw AppException.forbidden();
    }
    return true;
  }
}
