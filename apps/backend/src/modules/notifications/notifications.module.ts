import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationQueue } from './notification.queue';
import { NotificationsAdminController, NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { PushTokensService } from './push-tokens.service';
import { PushTokenRepository } from './repositories/push-token.repository';
import { notificationSendersProvider } from './senders/notification-senders.provider';

/**
 * Module notifications (UC-FRIDGE-04, FR-10): hàng đợi `notifications` (producer
 * NotificationQueue + worker NotificationsProcessor), adapter gửi Email/Push/Console,
 * push token thiết bị. B8 thêm cron nhắc hạn và bảng thông báo cho người dùng.
 * Exports NotificationQueue so any module can enqueue notifications.
 */
@Module({
  imports: [UsersModule],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [
    notificationSendersProvider,
    NotificationDispatcher,
    NotificationQueue,
    NotificationsProcessor,
    PushTokensService,
    PushTokenRepository,
  ],
  exports: [NotificationQueue],
})
export class NotificationsModule {}
