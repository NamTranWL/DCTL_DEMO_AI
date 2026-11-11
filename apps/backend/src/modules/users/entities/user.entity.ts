import { UserRole, UserStatus } from '@dctl/shared';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  type Relation,
  Unique,
} from 'typeorm';
import { InvalidStateTransitionException } from '../../../common/exceptions/domain.exceptions';
import { BaseEntity } from '../../../database/base.entity';
// Type-only import: `families` depends on `users` (Family.owner), so the reverse link is
// declared by entity name ('Family') to keep the module dependency graph acyclic.
import type { Family } from '../../families/entities/family.entity';
import { DietaryProfile } from './dietary-profile.entity';

/**
 * Tài khoản người dùng. Mỗi người thuộc tối đa một gia đình (BR-11).
 * Table: users (PROJECT_CONTEXT.md §11).
 * @uc UC-AUTH-01, UC-AUTH-02, UC-FAM-01, UC-ADM-01  @br BR-11
 */
@Entity('users')
@Unique('uq_users_username', ['username'])
@Unique('uq_users_email', ['email'])
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  username!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  /** bcrypt hash — never selected by default. */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.Member })
  role!: UserRole;

  /** Gia đình hiện tại; null khi chưa tham gia (BR-11). */
  @Index('idx_users_family_id')
  @Column({ type: 'uuid', nullable: true })
  familyId!: string | null;

  @ManyToOne('Family', 'members', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'family_id', foreignKeyConstraintName: 'fk_users_family' })
  family?: Relation<Family> | null;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.Active })
  status!: UserStatus;

  @OneToOne(() => DietaryProfile, (profile) => profile.user)
  dietaryProfile?: Relation<DietaryProfile>;

  /** Người dùng đã thuộc một gia đình chưa. @br BR-11 */
  hasFamily(): boolean {
    return this.familyId !== null;
  }

  /**
   * Tham gia gia đình với vai trò nội trợ hoặc thành viên.
   * Không được tham gia khi đang thuộc gia đình khác; Admin không tham gia gia đình.
   * @uc UC-FAM-01  @fr FR-03  @br BR-11
   */
  joinFamily(familyId: string, role: UserRole.Homemaker | UserRole.Member): void {
    if (this.role === UserRole.Admin) {
      throw new InvalidStateTransitionException(
        'User',
        UserRole.Admin,
        'JOIN_FAMILY',
        'Tài khoản quản trị không tham gia gia đình.',
      );
    }
    if (this.hasFamily()) {
      throw new InvalidStateTransitionException(
        'User',
        'IN_FAMILY',
        'JOIN_FAMILY',
        'Bạn đang thuộc một gia đình. Hãy rời gia đình hiện tại trước khi tham gia gia đình khác.',
      );
    }
    this.familyId = familyId;
    this.role = role;
  }

  /**
   * Rời gia đình hiện tại (hoặc bị xoá khỏi gia đình); vai trò trở về MEMBER.
   * @uc UC-FAM-01  @fr FR-03  @br BR-11
   */
  leaveFamily(): void {
    if (!this.hasFamily()) {
      throw new InvalidStateTransitionException(
        'User',
        'NO_FAMILY',
        'LEAVE_FAMILY',
        'Bạn chưa thuộc gia đình nào.',
      );
    }
    this.familyId = null;
    this.family = null;
    this.role = UserRole.Member;
  }

  /** Khoá tài khoản. @uc UC-ADM-01  @fr FR-24 */
  lock(): void {
    if (this.status === UserStatus.Locked) {
      throw new InvalidStateTransitionException('User', this.status, UserStatus.Locked);
    }
    this.status = UserStatus.Locked;
  }

  /** Mở khoá tài khoản. @uc UC-ADM-01  @fr FR-24 */
  unlock(): void {
    if (this.status === UserStatus.Active) {
      throw new InvalidStateTransitionException('User', this.status, UserStatus.Active);
    }
    this.status = UserStatus.Active;
  }
}
