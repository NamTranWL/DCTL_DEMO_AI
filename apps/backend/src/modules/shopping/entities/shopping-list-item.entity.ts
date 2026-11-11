import { ShoppingListItemStatus } from '@dctl/shared';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
  VersionColumn,
} from 'typeorm';
import {
  assertTransition,
  InvalidStateTransitionException,
} from '../../../common/exceptions/domain.exceptions';
import { BaseEntity } from '../../../database/base.entity';
import { quantityColumn } from '../../../database/transformers';
import { Category } from '../../master-data/entities/category.entity';
import { Food } from '../../master-data/entities/food.entity';
import { Unit } from '../../master-data/entities/unit.entity';
import { User } from '../../users/entities/user.entity';
import { ShoppingList } from './shopping-list.entity';

/**
 * State machine: PENDING (Chưa mua) ⇄ PURCHASED (Đã mua). PURCHASED → PENDING là "hoàn tác
 * đã mua" (quyết định B7), chỉ khi danh sách chưa hoàn tất — ShoppingService kiểm tra phần đó.
 */
export const SHOPPING_LIST_ITEM_TRANSITIONS: Readonly<
  Record<ShoppingListItemStatus, readonly ShoppingListItemStatus[]>
> = {
  [ShoppingListItemStatus.Pending]: [ShoppingListItemStatus.Purchased],
  [ShoppingListItemStatus.Purchased]: [ShoppingListItemStatus.Pending],
};

/** Fields of a pending item that the homemaker may edit. */
export interface ShoppingListItemChanges {
  foodId?: string | null;
  itemName?: string;
  categoryId?: string;
  expectedQuantity?: number;
  unitId?: string;
}

/**
 * Một mặt hàng trong danh sách mua sắm. Trạng thái PENDING/PURCHASED suy ra từ is_purchased.
 * `version` là khoá lạc quan: khi nhiều thành viên cùng sửa một mặt hàng, bản cập nhật
 * dựa trên version cũ bị từ chối (409 VERSION_CONFLICT) — NFR §9 "không mất cập nhật".
 * Table: shopping_list_items.
 * @uc UC-SHOP-01, UC-SHOP-02, UC-SHOP-03  @fr FR-03, FR-05, FR-07, FR-16  @br BR-02, BR-04
 */
@Entity('shopping_list_items')
@Check('chk_shopping_list_items_expected_quantity', '"expected_quantity" > 0')
export class ShoppingListItem extends BaseEntity {
  @Index('idx_shopping_list_items_shopping_list_id')
  @Column({ type: 'uuid' })
  shoppingListId!: string;

  @ManyToOne(() => ShoppingList, (list) => list.items, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'shopping_list_id',
    foreignKeyConstraintName: 'fk_shopping_list_items_shopping_list',
  })
  shoppingList?: Relation<ShoppingList>;

  @Index('idx_shopping_list_items_food_id')
  @Column({ type: 'uuid', nullable: true })
  foodId!: string | null;

  @ManyToOne(() => Food, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'food_id', foreignKeyConstraintName: 'fk_shopping_list_items_food' })
  food?: Relation<Food> | null;

  @Column({ type: 'varchar', length: 150 })
  itemName!: string;

  @Column({ type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_shopping_list_items_category' })
  category?: Relation<Category>;

  @Column(quantityColumn())
  expectedQuantity!: number;

  @Column({ type: 'uuid' })
  unitId!: string;

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id', foreignKeyConstraintName: 'fk_shopping_list_items_unit' })
  unit?: Relation<Unit>;

  @Column({ type: 'boolean', default: false })
  isPurchased!: boolean;

  /** Thành viên được phân công mua (FR-03). */
  @Index('idx_shopping_list_items_assignee_id')
  @Column({ type: 'uuid', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_id', foreignKeyConstraintName: 'fk_shopping_list_items_assignee' })
  assignee?: Relation<User> | null;

  @Column({ type: 'uuid', nullable: true })
  purchasedBy!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'purchased_by',
    foreignKeyConstraintName: 'fk_shopping_list_items_purchased_by',
  })
  purchaser?: Relation<User> | null;

  @Column({ type: 'timestamptz', nullable: true })
  purchasedAt!: Date | null;

  /** Optimistic lock version, tăng mỗi lần save(). */
  @VersionColumn({ default: 1 })
  version!: number;

  /** Trạng thái mặt hàng (Chưa mua / Đã mua). @uc UC-SHOP-02 */
  get status(): ShoppingListItemStatus {
    return this.isPurchased ? ShoppingListItemStatus.Purchased : ShoppingListItemStatus.Pending;
  }

  /**
   * Đánh dấu "Đã mua" (Chưa mua → Đã mua), ghi người mua và thời điểm.
   * @uc UC-SHOP-03  @fr FR-07
   */
  markAsPurchased(userId: string, at: Date = new Date()): void {
    assertTransition(
      'ShoppingListItem',
      SHOPPING_LIST_ITEM_TRANSITIONS,
      this.status,
      ShoppingListItemStatus.Purchased,
      'Mặt hàng này đã được đánh dấu đã mua.',
    );
    this.isPurchased = true;
    this.purchasedBy = userId;
    this.purchasedAt = at;
  }

  /**
   * Hoàn tác "Đã mua" khi bấm nhầm (Đã mua → Chưa mua), xoá người mua và thời điểm.
   * @uc UC-SHOP-03  @fr FR-07
   */
  unmarkPurchased(): void {
    assertTransition(
      'ShoppingListItem',
      SHOPPING_LIST_ITEM_TRANSITIONS,
      this.status,
      ShoppingListItemStatus.Pending,
      'Mặt hàng này chưa được đánh dấu đã mua.',
    );
    this.isPurchased = false;
    this.purchasedBy = null;
    this.purchasedAt = null;
  }

  /**
   * Phân công (hoặc bỏ phân công khi null) một thành viên mua mặt hàng.
   * @uc UC-SHOP-01  @fr FR-03
   */
  assignTo(userId: string | null): void {
    this.assertPending('ASSIGN', 'Không thể phân công mặt hàng đã mua.');
    this.assigneeId = userId;
  }

  /**
   * Sửa thông tin mặt hàng chưa mua (tên/thực phẩm, danh mục, số lượng, đơn vị).
   * @uc UC-SHOP-01  @fr FR-04, FR-05  @br BR-04
   */
  edit(changes: ShoppingListItemChanges): void {
    this.assertPending('EDIT', 'Không thể sửa mặt hàng đã mua. Hãy hoàn tác "đã mua" trước.');
    if (changes.foodId !== undefined) {
      this.foodId = changes.foodId;
      this.food = undefined;
    }
    if (changes.itemName !== undefined) {
      this.itemName = changes.itemName;
    }
    if (changes.categoryId !== undefined) {
      this.categoryId = changes.categoryId;
      this.category = undefined;
    }
    if (changes.expectedQuantity !== undefined) {
      this.expectedQuantity = changes.expectedQuantity;
    }
    if (changes.unitId !== undefined) {
      this.unitId = changes.unitId;
      this.unit = undefined;
    }
  }

  private assertPending(action: string, message: string): void {
    if (this.isPurchased) {
      throw new InvalidStateTransitionException(
        'ShoppingListItem',
        ShoppingListItemStatus.Purchased,
        action,
        message,
      );
    }
  }
}
