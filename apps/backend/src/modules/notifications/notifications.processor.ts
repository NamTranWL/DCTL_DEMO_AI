import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NOTIFICATION_JOBS, type SendNotificationJobData } from './notification-jobs';
import { type DeliveryResult } from './notification.types';

/**
 * Worker của hàng đợi `notifications`: lấy job, gửi qua NotificationDispatcher. Lỗi tạm thời
 * → BullMQ thử lại (3 lần, back-off mũ); nhắc hạn vẫn chạy khi app mobile đóng (NFR §9).
 * @uc UC-FRIDGE-04  @fr FR-10
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly dispatcher: NotificationDispatcher) {
    super();
  }

  /** Xử lý một job theo tên. @fr FR-10 */
  async process(job: Job<SendNotificationJobData>): Promise<DeliveryResult> {
    switch (job.name) {
      case NOTIFICATION_JOBS.SEND:
        return this.dispatcher.deliver(job.data);
      default:
        throw new UnrecoverableError(`Unknown job "${job.name}"`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SendNotificationJobData> | undefined, error: Error): void {
    this.logger.warn(
      `Job ${job?.id ?? '?'} (${job?.name ?? '?'}) attempt ${job?.attemptsMade ?? '?'} failed: ${error.message}`,
    );
  }
}
