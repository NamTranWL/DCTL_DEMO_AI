import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators/auth.decorators';
import { type AuthUser } from '../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../config/swagger.config';
import { AuthService } from './auth.service';
import {
  AuthSessionResponse,
  AuthTokensResponse,
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto/auth.dto';

/**
 * Đăng ký, đăng nhập, làm mới phiên, đăng xuất, đổi mật khẩu.
 * @uc UC-AUTH-01, UC-AUTH-02  @fr FR-01
 */
@ApiTags(ApiTag.Auth)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Đăng ký tài khoản. @uc UC-AUTH-01  @fr FR-01 */
  @Public()
  @Post('register')
  @ApiCreatedResponse({ type: AuthSessionResponse })
  register(@Body() dto: RegisterDto): Promise<AuthSessionResponse> {
    return this.authService.register(dto);
  }

  /** Đăng nhập. @uc UC-AUTH-02  @fr FR-01 */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthSessionResponse })
  login(@Body() dto: LoginDto): Promise<AuthSessionResponse> {
    return this.authService.login(dto);
  }

  /** Làm mới phiên (xoay vòng refresh token). @uc UC-AUTH-02  @fr FR-01 */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponse })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Đăng xuất khỏi thiết bị hiện tại. @uc UC-AUTH-02  @fr FR-01 */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  /** Đổi mật khẩu (đăng xuất mọi thiết bị khác). @uc UC-AUTH-02  @fr FR-01 */
  @ApiBearerAuth(BEARER_AUTH)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponse })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<AuthTokensResponse> {
    return this.authService.changePassword(user.id, dto);
  }
}
