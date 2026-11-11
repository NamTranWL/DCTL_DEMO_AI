import { Inject, Injectable } from '@nestjs/common';
import { type AppConfig, appConfig } from '../../config/configuration';
import { type IsoDate, todayIn } from '../utils/date.util';

/**
 * Đồng hồ nghiệp vụ: "hôm nay" luôn tính theo múi giờ APP_TIMEZONE (Asia/Ho_Chi_Minh), dùng cho
 * hạn dùng (BR-01, BR-02), ngày đi chợ và cron nhắc hạn (B8). Unit test thay bằng giá trị cố định.
 * @br BR-01, BR-02
 */
@Injectable()
export class BusinessClock {
  constructor(@Inject(appConfig.KEY) private readonly app: AppConfig) {}

  /** Thời điểm hiện tại. */
  now(): Date {
    return new Date();
  }

  /** Ngày hôm nay 'YYYY-MM-DD' theo múi giờ nghiệp vụ. @br BR-01 */
  today(): IsoDate {
    return todayIn(this.app.timezone, this.now());
  }
}
