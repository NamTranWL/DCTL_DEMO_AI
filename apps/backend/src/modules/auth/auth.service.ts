import { UserStatus } from '@dctl/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { UserResponse } from '../users/dto/user.response';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  type AuthSessionResponse,
  type AuthTokensResponse,
  type ChangePasswordDto,
  type LoginDto,
  type RegisterDto,
} from './dto/auth.dto';
import { PasswordHasher } from './password-hasher.service';
import { TokenService } from './token.service';

/**
 * Xác thực người dùng: đăng ký, đăng nhập, làm mới phiên, đăng xuất, đổi mật khẩu.
 * @uc UC-AUTH-01, UC-AUTH-02  @fr FR-01
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Đăng ký tài khoản mới (chưa thuộc gia đình) và đăng nhập luôn.
   * @uc UC-AUTH-01  @fr FR-01  @br BR-11
   */
  async register(dto: RegisterDto): Promise<AuthSessionResponse> {
    const user = await this.usersService.createAccount({
      username: dto.username,
      email: dto.email,
      passwordHash: await this.passwords.hash(dto.password),
    });
    return this.session(user);
  }

  /**
   * Đăng nhập bằng username hoặc email. Sai thông tin luôn trả cùng một lỗi (không lộ
   * tài khoản nào tồn tại); tài khoản bị khoá → 403.
   * @uc UC-AUTH-02  @fr FR-01
   */
  async login(dto: LoginDto): Promise<AuthSessionResponse> {
    const user = await this.usersService.findForLogin(dto.login);
    const valid = user
      ? await this.passwords.verify(dto.password, user.passwordHash)
      : await this.passwords.verifyAgainstDummy(dto.password);
    if (!user || !valid) {
      throw new AppException(ErrorCode.InvalidCredentials, undefined, HttpStatus.UNAUTHORIZED);
    }
    this.assertActive(user);
    return this.session(user);
  }

  /**
   * Đổi refresh token lấy cặp token mới (claims cập nhật theo DB, vd sau khi tham gia gia đình).
   * @uc UC-AUTH-02  @fr FR-01
   */
  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const userId = await this.tokens.consumeRefreshToken(refreshToken);
    const user = await this.usersService.getById(userId);
    this.assertActive(user);
    return this.tokens.issueTokens(user);
  }

  /** Đăng xuất: thu hồi refresh token của thiết bị này. @uc UC-AUTH-02  @fr FR-01 */
  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeRefreshToken(refreshToken);
  }

  /**
   * Đổi mật khẩu: kiểm tra mật khẩu hiện tại, thu hồi mọi phiên cũ trên các thiết bị
   * và cấp cặp token mới cho thiết bị hiện tại.
   * @uc UC-AUTH-02  @fr FR-01
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthTokensResponse> {
    const user = await this.usersService.findWithPassword(userId);
    if (!user) {
      throw AppException.notFound('Không tìm thấy tài khoản.');
    }
    if (!(await this.passwords.verify(dto.currentPassword, user.passwordHash))) {
      throw new AppException(ErrorCode.WrongCurrentPassword, undefined, HttpStatus.BAD_REQUEST);
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new AppException(ErrorCode.SamePassword, undefined, HttpStatus.BAD_REQUEST);
    }
    await this.usersService.updatePasswordHash(user.id, await this.passwords.hash(dto.newPassword));
    await this.tokens.revokeAllForUser(user.id);
    return this.tokens.issueTokens(user);
  }

  private async session(user: User): Promise<AuthSessionResponse> {
    const tokens = await this.tokens.issueTokens(user);
    return { ...tokens, user: UserResponse.from(user) };
  }

  private assertActive(user: Pick<User, 'status'>): void {
    if (user.status !== UserStatus.Active) {
      throw new AppException(ErrorCode.AccountLocked, undefined, HttpStatus.FORBIDDEN);
    }
  }
}
