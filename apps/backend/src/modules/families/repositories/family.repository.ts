import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { Family } from '../entities/family.entity';

/** Truy xuất gia đình (Repository pattern, §10). */
@Injectable()
export class FamilyRepository extends BaseRepository<Family> {
  constructor(dataSource: DataSource) {
    super(Family, dataSource);
  }

  findByInviteCode(inviteCode: string): Promise<Family | null> {
    return this.findOneBy({ inviteCode });
  }

  existsByInviteCode(inviteCode: string): Promise<boolean> {
    return this.existsBy({ inviteCode });
  }

  /** Khoá dòng gia đình trong transaction hiện tại. */
  findByIdForUpdate(id: string): Promise<Family | null> {
    return this.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }
}
