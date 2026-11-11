import { type PushPlatform } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { PushTokenRepository } from './repositories/push-token.repository';

/**
 * Quản lý push token thiết bị của người dùng (app gọi sau khi đăng nhập / khi đăng xuất).
 * @uc UC-FRIDGE-04  @fr FR-10
 */
@Injectable()
export class PushTokensService {
  constructor(private readonly pushTokens: PushTokenRepository) {}

  /** Đăng ký token của thiết bị cho người dùng hiện tại (gọi lại nhiều lần không lỗi). @fr FR-10 */
  register(userId: string, token: string, platform: PushPlatform): Promise<void> {
    return this.pushTokens.upsertForUser(userId, token, platform);
  }

  /** Huỷ đăng ký token (đăng xuất trên thiết bị). Chỉ xoá token của chính người dùng. @fr FR-10 */
  async unregister(userId: string, token: string): Promise<void> {
    await this.pushTokens.deleteForUser(userId, token);
  }
}
