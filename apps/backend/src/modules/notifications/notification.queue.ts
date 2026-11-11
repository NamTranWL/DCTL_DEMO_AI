import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { type JobsOptions, Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { NOTIFICATION_JOBS, type SendNotificationJobData } from './notification-jobs';
import { NotificationChannel, type NotificationContent } from './notification.types';

export interface NotifyRequest extends NotificationContent {
  userId: string;
  /** Default: every channel (Email + Push). */
  channels?: NotificationChannel[];
  /**
   * Idempotency key: the same key never enqueues twice (BullMQ jobId), e.g.
   * `expiry:{fridgeItemId}:{date}` so an item is reminded at most once a day (BR-01, B8).
   */
  dedupeKey?: string;
  /** Delay before delivery, in ms. */
  delayMs?: number;
}

/**
 * Producer của hàng đợi `notifications`: nghiệp vụ gọi notify() rồi trả lời ngay, việc gửi
 * Push/Email chạy nền trong NotificationsProcessor, có retry (§10 Queue).
 * @uc UC-FRIDGE-04  @fr FR-10  @br BR-01
 */
@Injectable()
export class NotificationQueue {
  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly queue: Queue<SendNotificationJobData>,
  ) {}

  /** Xếp thông báo vào hàng đợi, mỗi kênh một job. Trả về id các job. @fr FR-10 */
  async notify(request: NotifyRequest): Promise<string[]> {
    const channels = request.channels ?? Object.values(NotificationChannel);
    const ids: string[] = [];
    for (const channel of [...new Set(channels)]) {
      const options: JobsOptions = {};
      if (request.dedupeKey) {
        options.jobId = `${request.dedupeKey}:${channel}`;
      }
      if (request.delayMs) {
        options.delay = request.delayMs;
      }
      const job = await this.queue.add(
        NOTIFICATION_JOBS.SEND,
        {
          userId: request.userId,
          channel,
          title: request.title,
          body: request.body,
          data: request.data,
        },
        options,
      );
      ids.push(job.id ?? '');
    }
    return ids;
  }
}
