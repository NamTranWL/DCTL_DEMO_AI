import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { UserRepository } from '../users/repositories/user.repository';
import { type SendNotificationJobData } from './notification-jobs';
import { type DeliveryResult } from './notification.types';
import { PushTokenRepository } from './repositories/push-token.repository';
import { NOTIFICATION_SENDERS, type NotificationSender } from './senders/notification-sender';

/**
 * Giao một thông báo tới người dùng qua đúng kênh: tìm địa chỉ (email, push token) trong DB,
 * gọi adapter của kênh, dọn push token không còn hợp lệ. Chạy trong worker của hàng đợi
 * (không chặn request — §10 Queue).
 * @uc UC-FRIDGE-04  @fr FR-10
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    @Inject(NOTIFICATION_SENDERS) private readonly senders: NotificationSender[],
    private readonly users: UserRepository,
    private readonly pushTokens: PushTokenRepository,
  ) {}

  /**
   * Gửi thông báo của một job. Người dùng không còn tồn tại / kênh không có adapter →
   * lỗi không thử lại (UnrecoverableError); lỗi mạng của adapter → ném lại để BullMQ retry.
   * @uc UC-FRIDGE-04  @fr FR-10
   */
  async deliver(job: SendNotificationJobData): Promise<DeliveryResult> {
    const sender = this.senders.find((candidate) => candidate.channel === job.channel);
    if (!sender) {
      throw new UnrecoverableError(`No sender configured for channel ${job.channel}`);
    }
    const user = await this.users.findOne({
      where: { id: job.userId },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new UnrecoverableError(`User ${job.userId} no longer exists`);
    }

    const result = await sender.send({
      recipient: {
        userId: user.id,
        email: user.email,
        pushTokens: await this.pushTokens.tokensOf(user.id),
      },
      title: job.title,
      body: job.body,
      data: job.data,
    });

    if (result.invalidPushTokens && result.invalidPushTokens.length > 0) {
      const removed = await this.pushTokens.deleteTokens(result.invalidPushTokens);
      this.logger.log(`Removed ${removed} invalid push token(s) of user ${user.id}`);
    }
    return result;
  }
}
