import { type UserRole } from '@dctl/shared';
import {
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-code.enum';
import { type AuthenticatedRequest, type AuthUser } from '../types/auth-user';

/**
 * Metadata-only decorators read by the global guards of the auth module
 * (JwtAuthGuard → RolesGuard → FamilyMemberGuard). They live in `common` so feature
 * modules can use them without depending on the auth module.
 */

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const REQUIRE_FAMILY_KEY = 'auth:requireFamily';

/** Mở endpoint cho khách (không cần đăng nhập). Mặc định mọi endpoint đều cần JWT. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Chỉ cho phép các vai trò được liệt kê (RolesGuard). */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Bắt buộc người dùng đã thuộc một gia đình (FamilyMemberGuard) — dùng cho mọi endpoint
 * thao tác dữ liệu theo gia đình (kho, mua sắm, thực đơn…).
 * @br BR-06, BR-11
 */
export const RequireFamily = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_FAMILY_KEY, true);

function requestUser(context: ExecutionContext): AuthUser {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    // Only reachable if a handler is @Public() but still asks for the user.
    throw new AppException(ErrorCode.TokenMissing, undefined, HttpStatus.UNAUTHORIZED);
  }
  return request.user;
}

/** Người dùng đang đăng nhập (đã nạp lại từ DB). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => requestUser(context),
);

/**
 * family_id của người dùng đang đăng nhập — nguồn DUY NHẤT của family_id cho truy vấn
 * dữ liệu gia đình; không bao giờ nhận family_id từ body/query/params (BR-06).
 * Dùng cùng @RequireFamily(); nếu người dùng chưa có gia đình sẽ trả FAMILY_REQUIRED.
 * @br BR-06
 */
export const CurrentFamilyId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { familyId } = requestUser(context);
    if (familyId === null) {
      throw new AppException(ErrorCode.FamilyRequired, undefined, HttpStatus.FORBIDDEN);
    }
    return familyId;
  },
);
