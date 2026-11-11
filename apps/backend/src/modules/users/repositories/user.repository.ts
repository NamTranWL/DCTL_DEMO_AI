import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { User } from '../entities/user.entity';

/**
 * Truy xuất dữ liệu người dùng (Repository pattern, §10).
 * `withManager()` returns the same repository bound to a transaction's EntityManager.
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(dataSource: DataSource) {
    super(User, dataSource);
  }

  /** Tìm theo username hoặc email (đã chuẩn hoá chữ thường), kèm password_hash. */
  findByLoginWithPassword(login: string): Promise<User | null> {
    return this.createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :login OR user.email = :login', { login })
      .getOne();
  }

  findByIdWithPassword(id: string): Promise<User | null> {
    return this.createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  /** Khoá dòng người dùng trong transaction hiện tại (chống tham gia 2 gia đình song song — BR-11). */
  findByIdForUpdate(id: string): Promise<User | null> {
    return this.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  existsByUsername(username: string): Promise<boolean> {
    return this.existsBy({ username });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.existsBy({ email });
  }

  /** Thành viên của một gia đình, người vào trước đứng trước. @br BR-06 */
  findFamilyMembers(familyId: string): Promise<User[]> {
    return this.find({ where: { familyId }, order: { createdAt: 'ASC' } });
  }

  countFamilyMembers(familyId: string): Promise<number> {
    return this.countBy({ familyId });
  }
}
