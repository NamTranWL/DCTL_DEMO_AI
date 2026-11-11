import { UserRole } from '@dctl/shared';
import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { type AuthUser } from '../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../config/swagger.config';
import {
  RegisterPushTokenDto,
  SendTestNotificationDto,
  SendTestNotificationResponse,
  UnregisterPushTokenDto,
} from './dto/notification.dto';
import { NotificationQueue } from './notification.queue';
import { PushTokensService } from './push-tokens.service';

/**
 * Push token thiết bị của người dùng (app đăng ký sau khi đăng nhập).
 * Danh sách thông báo/đánh dấu đã đọc làm ở B8.
 * @uc UC-FRIDGE-04  @fr FR-10
 */
@ApiTags(ApiTag.Notifications)
@ApiBearerAuth(BEARER_AUTH)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly pushTokensService: PushTokensService) {}

  /** Đăng ký push token của thiết bị này. @fr FR-10 */
  @Post('push-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async registerPushToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<void> {
    await this.pushTokensService.register(user.id, dto.token, dto.platform);
  }

  /** Huỷ push token (đăng xuất trên thiết bị). @fr FR-10 */
  @Delete('push-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async unregisterPushToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnregisterPushTokenDto,
  ): Promise<void> {
    await this.pushTokensService.unregister(user.id, dto.token);
  }
}

/**
 * Admin gửi thông báo thử qua hàng đợi để kiểm tra cấu hình Email (MailHog) / Expo push.
 * @uc UC-ADM-04  @fr FR-10, FR-27
 */
@ApiTags(ApiTag.Admin)
@ApiBearerAuth(BEARER_AUTH)
@Roles(UserRole.Admin)
@Controller('admin/notifications')
export class NotificationsAdminController {
  constructor(private readonly notificationQueue: NotificationQueue) {}

  /** Xếp một thông báo thử vào hàng đợi `notifications`. @uc UC-ADM-04  @fr FR-10 */
  @Post('test')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: SendTestNotificationResponse })
  async sendTest(
    @CurrentUser() admin: AuthUser,
    @Body() dto: SendTestNotificationDto,
  ): Promise<SendTestNotificationResponse> {
    const jobIds = await this.notificationQueue.notify({
      userId: dto.userId ?? admin.id,
      channels: dto.channels,
      title: 'Thông báo thử — Đi chợ Tiện lợi',
      body: `Đây là thông báo thử gửi lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
      data: { type: 'TEST' },
    });
    return { jobIds };
  }
}
