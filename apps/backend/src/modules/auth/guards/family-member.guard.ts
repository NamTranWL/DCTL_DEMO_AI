import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_FAMILY_KEY } from '../../../common/decorators/auth.decorators';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';
import { type AuthenticatedRequest } from '../../../common/types/auth-user';

/**
 * Guard toàn cục: endpoint gắn @RequireFamily() chỉ cho người dùng đã thuộc một gia đình;
 * chưa có gia đình → 403 FAMILY_REQUIRED. Kết hợp @CurrentFamilyId() để mọi truy vấn
 * dữ liệu gia đình luôn lọc theo family_id của chính người dùng (BR-06).
 * @uc UC-FAM-01  @br BR-06, BR-11
 */
@Injectable()
export class FamilyMemberGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_FAMILY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required !== true) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user?.familyId) {
      throw new AppException(ErrorCode.FamilyRequired, undefined, HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
