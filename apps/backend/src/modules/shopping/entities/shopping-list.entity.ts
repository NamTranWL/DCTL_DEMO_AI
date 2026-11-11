import { PeriodType, ShoppingListStatus } from '@dctl/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import {
  assertTransition,
  InvalidStateTransitionException,
} from '../../../common/exceptions/domain.exceptions';
import { type IsoDate } from '../../../common/utils/date.util';
import { BaseEntity } from '../../../database/base.entity';
import { Family } from '../../families/entities/family.entity';
import { User } from '../../users/entities/user.entity';
import { ShoppingListItem } from './shopping-list-item.entity';

/** State machine: DRAFT (Nháp) → SHOPPING (Đang mua) → COMPLETED (Hoàn tất) — §10. */
export const SHOPPING_LIST_TRANSITIONS: Readonly<
  Record<ShoppingListStatus, readonly ShoppingListStatus[]>
> = {
  [ShoppingListStatus.Draft]: [ShoppingListStatus.Shopping],
  [ShoppingListStatus.Shopping]: [ShoppingListStatus.Completed],
  [ShoppingListStatus.Completed]: [],
};

/**
 * Danh sách mua sắm của gia đình cho một ngày/tuần (target_date + period_type).
 * Hoàn tất chuyến đi chợ → tự đưa các mặt hàng đã mua vào kho (FR-08, BR-02).
 * Table: shopping_lists.
 * @uc UC-SHOP-01, UC-SHOP-02, UC-SHOP-03  @fr FR-04, FR-06, FR-08  @br BR-02, BR-06
 */
@Entity('shopping_lists')
@Index('idx_shopping_lists_family_id_target_date', ['familyId', 'targetDate'])
export class ShoppingList extends BaseEntity {
  @Index('idx_shopping_lists_family_id')
  @Column({ type: 'uuid' })
  familyId!: string;

  @ManyToOne(() => Family, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id', foreignKeyConstraintName: 'fk_shopping_lists_family' })
  family?: Relation<Family>;

  /** Ngày đi chợ (DAY) hoặc ngày đầu tuần (WEEK). */
  @Column({ type: 'date' })
  targetDate!: IsoDate;

  @Column({ type: 'enum', enum: PeriodType, default: PeriodType.Day })
  periodType!: PeriodType;

  @Column({
    type: 'enum',
    enum: ShoppingListStatus,
    default: ShoppingListStatus.Draft,
  })
  status!: ShoppingListStatus;

  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'fk_shopping_lists_created_by' })
  creator?: Relation<User> | null;

  @OneToMany(() => ShoppingListItem, (item) => item.shoppingList)
  items?: Relation<ShoppingListItem[]>;

  /** Còn thêm/sửa mặt hàng được không (chưa hoàn tất). @uc UC-SHOP-01 */
  isEditable(): boolean {
    return this.status !== ShoppingListStatus.Completed;
  }

  /**
   * Chặn mọi thay đổi trên danh sách đã hoàn tất (lịch sử mua sắm, FR-21) — 409.
   * @uc UC-SHOP-01, UC-SHOP-03
   */
  assertEditable(action: string): void {
    if (!this.isEditable()) {
      throw new InvalidStateTransitionException(
        'ShoppingList',
        this.status,
        action,
        'Danh sách đã hoàn tất nên không thể thay đổi.',
      );
    }
  }

  /**
   * Đánh dấu mặt hàng đầu tiên → danh sách tự chuyển Nháp → Đang mua.
   * Trả về true nếu trạng thái vừa đổi (để phát sự kiện cập nhật danh sách).
   * @uc UC-SHOP-03  @fr FR-07
   */
  ensureShopping(): boolean {
    if (this.status !== ShoppingListStatus.Draft) {
      return false;
    }
    this.startShopping();
    return true;
  }

  /**
   * Bắt đầu đi chợ (Nháp → Đang mua); gọi khi mặt hàng đầu tiên được đánh dấu đã mua.
   * @uc UC-SHOP-03  @fr FR-07
   */
  startShopping(): void {
    assertTransition(
      'ShoppingList',
      SHOPPING_LIST_TRANSITIONS,
      this.status,
      ShoppingListStatus.Shopping,
      'Danh sách không ở trạng thái nháp.',
    );
    this.status = ShoppingListStatus.Shopping;
  }

  /**
   * Hoàn tất chuyến đi chợ (Đang mua → Hoàn tất).
   * @uc UC-SHOP-03  @fr FR-08  @br BR-02
   */
  complete(): void {
    assertTransition(
      'ShoppingList',
      SHOPPING_LIST_TRANSITIONS,
      this.status,
      ShoppingListStatus.Completed,
      'Chỉ hoàn tất được danh sách đang đi chợ.',
    );
    this.status = ShoppingListStatus.Completed;
  }
}
