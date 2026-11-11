import { UserRole, UserStatus } from '@dctl/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type AuthUser } from '../../common/types/auth-user';
import { isRecord, PG_ERROR } from '../../common/utils/http-error.util';
import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';

export interface NewAccount {
  username: string;
  email: string;
  passwordHash: string;
}

/**
 * Quản lý tài khoản người dùng: tạo tài khoản, tra cứu, cập nhật mật khẩu.
 * Dùng bởi auth (đăng ký/đăng nhập) và families (thành viên).
 * @uc UC-AUTH-01, UC-AUTH-02  @fr FR-01
 */
@Injectable()
export class UsersService {
  constructor(private readonly users: UserRepository) {}

  /**
   * Tạo tài khoản mới (vai trò MEMBER, chưa thuộc gia đình).
   * Username/email trùng → 409 (kiểm tra trước và cả khi trùng do ghi song song).
   * @uc UC-AUTH-01  @fr FR-01  @br BR-11
   */
  async createAccount(account: NewAccount): Promise<User> {
    if (await this.users.existsByUsername(account.username)) {
      throw new AppException(ErrorCode.UsernameTaken, undefined, HttpStatus.CONFLICT);
    }
    if (await this.users.existsByEmail(account.email)) {
      throw new AppException(ErrorCode.EmailTaken, undefined, HttpStatus.CONFLICT);
    }
    const user = this.users.create({
      ...account,
      role: UserRole.Member,
      status: UserStatus.Active,
      familyId: null,
    });
    try {
      return await this.users.save(user);
    } catch (error: unknown) {
      throw this.translateUniqueViolation(error);
    }
  }

  /** Tìm người dùng theo username hoặc email, kèm hash mật khẩu (chỉ dùng cho đăng nhập). */
  findForLogin(login: string): Promise<User | null> {
    return this.users.findByLoginWithPassword(login);
  }

  /** Người dùng kèm hash mật khẩu (đổi mật khẩu). */
  findWithPassword(userId: string): Promise<User | null> {
    return this.users.findByIdWithPassword(userId);
  }

  /** Lấy người dùng theo id, 404 nếu không có. @uc UC-AUTH-02 */
  async getById(userId: string): Promise<User> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) {
      throw AppException.notFound('Không tìm thấy tài khoản.');
    }
    return user;
  }

  /**
   * Trạng thái hiện tại của người dùng cho JwtAuthGuard (nạp lại mỗi request, BR-06).
   * Trả null khi tài khoản không còn tồn tại.
   */
  async findAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, username: true, role: true, status: true, familyId: true },
    });
    return user
      ? {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          familyId: user.familyId,
        }
      : null;
  }

  /** Lưu hash mật khẩu mới. @uc UC-AUTH-02  @fr FR-01 */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.users.update({ id: userId }, { passwordHash });
  }

  private translateUniqueViolation(error: unknown): unknown {
    if (!(error instanceof QueryFailedError)) {
      return error;
    }
    const driverError: unknown = error.driverError;
    if (!isRecord(driverError) || driverError.code !== PG_ERROR.UNIQUE_VIOLATION) {
      return error;
    }
    return driverError.constraint === 'uq_users_email'
      ? new AppException(ErrorCode.EmailTaken, undefined, HttpStatus.CONFLICT)
      : new AppException(ErrorCode.UsernameTaken, undefined, HttpStatus.CONFLICT);
  }
}
