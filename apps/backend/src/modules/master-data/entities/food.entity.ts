import { ApprovalStatus } from '@dctl/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation, Unique } from 'typeorm';
import { assertTransition } from '../../../common/exceptions/domain.exceptions';
import { BaseEntity } from '../../../database/base.entity';
import { Family } from '../../families/entities/family.entity';
import { Category } from './category.entity';

/** State machine of a food name contributed by users (PROJECT_CONTEXT.md §10). */
export const FOOD_APPROVAL_TRANSITIONS: Readonly<
  Record<ApprovalStatus, readonly ApprovalStatus[]>
> = {
  [ApprovalStatus.Pending]: [ApprovalStatus.Approved, ApprovalStatus.Rejected],
  [ApprovalStatus.Approved]: [],
  [ApprovalStatus.Rejected]: [],
};

/**
 * Thực phẩm chuẩn (master data tên thực phẩm), vd "Thịt ba chỉ", "Cà chua".
 * Tên do người dùng nhập mới → PENDING, dùng được ngay trong gia đình tạo ra nó,
 * công khai sau khi Admin duyệt (BR-04, BR-08). `name` đã chuẩn hoá và duy nhất.
 * Table: foods.
 * @uc UC-ADM-02, UC-ADM-03, UC-FRIDGE-01  @fr FR-09, FR-25, FR-26  @br BR-04, BR-08
 */
@Entity('foods')
@Unique('uq_foods_name', ['name'])
export class Food extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Index('idx_foods_category_id')
  @Column({ type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_foods_category' })
  category?: Relation<Category>;

  @Index('idx_foods_approval_status')
  @Column({
    type: 'enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.Pending,
  })
  approvalStatus!: ApprovalStatus;

  /** Gia đình đã đề xuất tên này; NULL với dữ liệu chuẩn do Admin tạo. */
  @Index('idx_foods_created_by_family_id')
  @Column({ type: 'uuid', nullable: true })
  createdByFamilyId!: string | null;

  @ManyToOne(() => Family, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'created_by_family_id',
    foreignKeyConstraintName: 'fk_foods_created_by_family',
  })
  createdByFamily?: Relation<Family> | null;

  /** Gia đình có được thấy/dùng tên này không (APPROVED, hoặc PENDING do chính họ tạo). @br BR-04 */
  isVisibleTo(familyId: string | null): boolean {
    if (this.approvalStatus === ApprovalStatus.Approved) {
      return true;
    }
    return (
      this.approvalStatus === ApprovalStatus.Pending &&
      familyId !== null &&
      this.createdByFamilyId === familyId
    );
  }

  /** Admin duyệt tên thực phẩm mới. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  approve(): void {
    assertTransition(
      'Food',
      FOOD_APPROVAL_TRANSITIONS,
      this.approvalStatus,
      ApprovalStatus.Approved,
    );
    this.approvalStatus = ApprovalStatus.Approved;
  }

  /** Admin từ chối tên thực phẩm mới. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  reject(): void {
    assertTransition(
      'Food',
      FOOD_APPROVAL_TRANSITIONS,
      this.approvalStatus,
      ApprovalStatus.Rejected,
    );
    this.approvalStatus = ApprovalStatus.Rejected;
  }
}
