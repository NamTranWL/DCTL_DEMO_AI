import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { UserResponse } from '../../users/dto/user.response';

const normalizeLogin = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Username: 3–30 ký tự a-z, 0-9, dấu chấm, gạch dưới (lưu chữ thường). */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;
/** Mật khẩu: 8–72 ký tự (giới hạn của bcrypt), có ít nhất 1 chữ cái và 1 chữ số. */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const PASSWORD_MESSAGE = 'Mật khẩu dài 8–72 ký tự, gồm ít nhất một chữ cái và một chữ số.';

/** Đăng ký tài khoản. @uc UC-AUTH-01  @fr FR-01 */
export class RegisterDto {
  @ApiProperty({ example: 'noitro' })
  @Transform(normalizeLogin)
  @IsString({ message: 'Tên đăng nhập phải là chuỗi.' })
  @Matches(USERNAME_PATTERN, {
    message: 'Tên đăng nhập dài 3–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới.',
  })
  username!: string;

  @ApiProperty({ example: 'noitro@example.com' })
  @Transform(normalizeLogin)
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự.' })
  email!: string;

  @ApiProperty({ example: 'Demo@123', minLength: 8, maxLength: 72 })
  @IsString({ message: PASSWORD_MESSAGE })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;
}

/** Đăng nhập bằng tên đăng nhập hoặc email. @uc UC-AUTH-02  @fr FR-01 */
export class LoginDto {
  @ApiProperty({ example: 'noitro', description: 'Tên đăng nhập hoặc email' })
  @Transform(normalizeLogin)
  @IsString({ message: 'Vui lòng nhập tên đăng nhập hoặc email.' })
  @Length(3, 255, { message: 'Vui lòng nhập tên đăng nhập hoặc email.' })
  login!: string;

  @ApiProperty({ example: 'Demo@123' })
  @IsString({ message: 'Vui lòng nhập mật khẩu.' })
  @Length(1, 72, { message: 'Vui lòng nhập mật khẩu.' })
  password!: string;
}

/** Làm mới hoặc thu hồi phiên bằng refresh token. @uc UC-AUTH-02  @fr FR-01 */
export class RefreshTokenDto {
  @ApiProperty()
  @IsString({ message: 'Thiếu refresh token.' })
  @Length(20, 200, { message: 'Refresh token không hợp lệ.' })
  refreshToken!: string;
}

/** Đổi mật khẩu. @uc UC-AUTH-02  @fr FR-01 */
export class ChangePasswordDto {
  @ApiProperty()
  @IsString({ message: 'Vui lòng nhập mật khẩu hiện tại.' })
  @Length(1, 72, { message: 'Vui lòng nhập mật khẩu hiện tại.' })
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString({ message: PASSWORD_MESSAGE })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}

/** Cặp token trả về sau đăng ký/đăng nhập/làm mới. */
export class AuthTokensResponse {
  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'JWT dùng cho header Authorization và handshake WebSocket' })
  accessToken!: string;

  @ApiProperty({ description: 'Số giây đến khi access token hết hạn', example: 900 })
  expiresIn!: number;

  @ApiProperty({ description: 'Token mờ dùng một lần để lấy cặp token mới' })
  refreshToken!: string;

  @ApiProperty()
  refreshExpiresAt!: Date;
}

/** Kết quả đăng ký/đăng nhập: token + thông tin tài khoản. */
export class AuthSessionResponse extends AuthTokensResponse {
  @ApiProperty({ type: UserResponse })
  user!: UserResponse;
}
