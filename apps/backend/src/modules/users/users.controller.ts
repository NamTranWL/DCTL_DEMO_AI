import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { type AuthUser } from '../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../config/swagger.config';
import { DietaryProfileService } from './dietary-profile.service';
import { DietaryProfileResponse, UpsertDietaryProfileDto } from './dto/dietary-profile.dto';
import { UserResponse } from './dto/user.response';
import { UsersService } from './users.service';

/**
 * Tài khoản và hồ sơ ăn uống của người dùng đang đăng nhập (chỉ `/me` — không có
 * endpoint nhận id người khác, nên không đọc được dữ liệu của người/gia đình khác).
 * @uc UC-AUTH-02, UC-FAM-02  @fr FR-01, FR-02  @br BR-06
 */
@ApiTags(ApiTag.Users)
@ApiBearerAuth(BEARER_AUTH)
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly dietaryProfileService: DietaryProfileService,
  ) {}

  /** Thông tin tài khoản của tôi. @uc UC-AUTH-02  @fr FR-01 */
  @Get()
  @ApiOkResponse({ type: UserResponse })
  async getMe(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return UserResponse.from(await this.usersService.getById(user.id));
  }

  /** Xem hồ sơ ăn uống của tôi. @uc UC-FAM-02  @fr FR-02 */
  @Get('dietary-profile')
  @ApiOkResponse({ type: DietaryProfileResponse })
  async getDietaryProfile(@CurrentUser() user: AuthUser): Promise<DietaryProfileResponse> {
    return DietaryProfileResponse.from(await this.dietaryProfileService.get(user.id));
  }

  /** Thiết lập (tạo/thay) hồ sơ ăn uống của tôi. @uc UC-FAM-02  @fr FR-02  @br BR-07 */
  @Put('dietary-profile')
  @ApiOkResponse({ type: DietaryProfileResponse })
  async upsertDietaryProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertDietaryProfileDto,
  ): Promise<DietaryProfileResponse> {
    return DietaryProfileResponse.from(await this.dietaryProfileService.upsert(user.id, dto));
  }

  /** Xoá hồ sơ ăn uống của tôi. @uc UC-FAM-02  @fr FR-02 */
  @Delete('dietary-profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async resetDietaryProfile(@CurrentUser() user: AuthUser): Promise<void> {
    await this.dietaryProfileService.reset(user.id);
  }
}
