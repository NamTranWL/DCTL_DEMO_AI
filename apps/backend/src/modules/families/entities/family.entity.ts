import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
  Unique,
} from 'typeorm';
import { InvalidStateTransitionException } from '../../../common/exceptions/domain.exceptions';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Nhóm gia đình: dùng chung kho, danh sách mua sắm, thực đơn. Dữ liệu cách ly theo family_id (BR-06).
 * Table: families. Người tạo là chủ gia đình (owner, vai trò HOMEMAKER).
 * `invite_code` (bổ sung B4): mã 8 ký tự để thành viên tự tham gia; chủ gia đình đổi được.
 * @uc UC-FAM-01  @fr FR-03  @br BR-06, BR-11
 */
@Entity('families')
@Unique('uq_families_invite_code', ['inviteCode'])
export class Family extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index('idx_families_owner_id')
  @Column({ type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id', foreignKeyConstraintName: 'fk_families_owner' })
  owner?: Relation<User>;

  /** Mã mời tham gia gia đình (chữ in hoa + số, không phân biệt hoa thường khi nhập). */
  @Column({ type: 'varchar', length: 8 })
  inviteCode!: string;

  @OneToMany(() => User, (user) => user.family)
  members?: Relation<User[]>;

  /** Người dùng có phải chủ gia đình không. @uc UC-FAM-01 */
  isOwner(userId: string): boolean {
    return this.ownerId === userId;
  }

  /** Đổi mã mời (mã cũ hết hiệu lực ngay). @uc UC-FAM-01  @fr FR-03 */
  rotateInviteCode(newCode: string): void {
    this.inviteCode = newCode;
  }

  /**
   * Chuyển quyền chủ gia đình cho một thành viên khác (đã kiểm tra cùng gia đình ở service).
   * @uc UC-FAM-01  @fr FR-03  @br BR-11
   */
  transferOwnershipTo(newOwnerId: string): void {
    if (newOwnerId === this.ownerId) {
      throw new InvalidStateTransitionException(
        'Family',
        'OWNER',
        'TRANSFER_OWNERSHIP',
        'Người này đã là chủ gia đình.',
      );
    }
    this.ownerId = newOwnerId;
  }
}
