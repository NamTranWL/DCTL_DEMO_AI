import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { DietaryProfile } from '../entities/dietary-profile.entity';

/** Truy xuất hồ sơ ăn uống (Repository pattern, §10). */
@Injectable()
export class DietaryProfileRepository extends BaseRepository<DietaryProfile> {
  constructor(dataSource: DataSource) {
    super(DietaryProfile, dataSource);
  }

  findByUserId(userId: string): Promise<DietaryProfile | null> {
    return this.findOneBy({ userId });
  }

  /** Hồ sơ ăn uống của mọi thành viên trong một gia đình (ràng buộc cho AI). @br BR-06, BR-07 */
  findByFamilyId(familyId: string): Promise<DietaryProfile[]> {
    return this.createQueryBuilder('profile')
      .innerJoin('profile.user', 'user')
      .where('user.familyId = :familyId', { familyId })
      .getMany();
  }
}
