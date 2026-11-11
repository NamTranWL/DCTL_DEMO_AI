import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { RefreshToken } from '../entities/refresh-token.entity';

/** Truy xuất refresh token đã cấp (Repository pattern, §10). */
@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshToken> {
  constructor(dataSource: DataSource) {
    super(RefreshToken, dataSource);
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.findOneBy({ tokenHash });
  }

  /** Thu hồi mọi refresh token còn hiệu lực của người dùng. Trả về số token bị thu hồi. */
  async revokeAllForUser(userId: string, at: Date = new Date()): Promise<number> {
    const result = await this.update({ userId, revokedAt: IsNull() }, { revokedAt: at });
    return result.affected ?? 0;
  }
}
