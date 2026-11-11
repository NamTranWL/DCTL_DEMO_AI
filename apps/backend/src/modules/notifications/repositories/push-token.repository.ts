import { type PushPlatform } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { PushToken } from '../entities/push-token.entity';

/** Truy xuất push token thiết bị (Repository pattern, §10). */
@Injectable()
export class PushTokenRepository extends BaseRepository<PushToken> {
  constructor(dataSource: DataSource) {
    super(PushToken, dataSource);
  }

  /** Gắn token cho người dùng; token đã thuộc người khác thì chuyển chủ (cùng một máy). */
  async upsertForUser(userId: string, token: string, platform: PushPlatform): Promise<void> {
    await this.createQueryBuilder()
      .insert()
      .into(PushToken)
      .values({ userId, token, platform })
      .orUpdate(['user_id', 'platform', 'updated_at'], ['token'])
      .execute();
  }

  async tokensOf(userId: string): Promise<string[]> {
    const rows = await this.find({ where: { userId }, select: { token: true } });
    return rows.map((row) => row.token);
  }

  async deleteForUser(userId: string, token: string): Promise<number> {
    return (await this.delete({ userId, token })).affected ?? 0;
  }

  async deleteTokens(tokens: readonly string[]): Promise<number> {
    if (tokens.length === 0) {
      return 0;
    }
    return (await this.delete({ token: In([...tokens]) })).affected ?? 0;
  }
}
