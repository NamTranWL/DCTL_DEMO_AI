import {
  EXPIRY_SOON_DAYS,
  FridgeItemState,
  InventoryTransactionType,
  StorageLocation,
} from '@dctl/shared';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import {
  InsufficientStockException,
  InvalidQuantityException,
} from '../../../common/exceptions/domain.exceptions';
import { daysBetween, type IsoDate } from '../../../common/utils/date.util';
import { BaseEntity } from '../../../database/base.entity';
import { moneyColumn, quantityColumn } from '../../../database/transformers';
import { Family } from '../../families/entities/family.entity';
import { Category } from '../../master-data/entities/category.entity';
import { Food } from '../../master-data/entities/food.entity';
import { Unit } from '../../master-data/entities/unit.entity';

/**
 * Một lô thực phẩm đang có trong kho của gia đình.
 * Trạng thái (FridgeItemState) KHÔNG lưu cột mà tính bằng getState() (quyết định B3).
 * Tồn kho không âm (BR-03, ràng buộc CHECK ở DB). Mọi thay đổi số lượng phải kèm một
 * bản ghi inventory_transactions (FridgeService, B7).
 * Table: fridge_items.
 * @uc UC-FRIDGE-01, UC-FRIDGE-02, UC-FRIDGE-03, UC-FRIDGE-04
 * @fr FR-09, FR-10, FR-11, FR-12, FR-13  @br BR-01, BR-03, BR-04, BR-06
 */
@Entity('fridge_items')
@Index('idx_fridge_items_family_id_expiry_date', ['familyId', 'expiryDate'])
@Check('chk_fridge_items_quantity', '"quantity" >= 0')
export class FridgeItem extends BaseEntity {
  @Index('idx_fridge_items_family_id')
  @Column({ type: 'uuid' })
  familyId!: string;

  @ManyToOne(() => Family, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id', foreignKeyConstraintName: 'fk_fridge_items_family' })
  family?: Relation<Family>;

  @Index('idx_fridge_items_food_id')
  @Column({ type: 'uuid', nullable: true })
  foodId!: string | null;

  @ManyToOne(() => Food, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'food_id', foreignKeyConstraintName: 'fk_fridge_items_food' })
  food?: Relation<Food> | null;

  /** Tên hiển thị (giữ song song food_id cho dữ liệu cũ/OCR chưa khớp — §11). */
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Index('idx_fridge_items_category_id')
  @Column({ type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_fridge_items_category' })
  category?: Relation<Category>;

  @Column(quantityColumn())
  quantity!: number;

  @Column({ type: 'uuid' })
  unitId!: string;

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id', foreignKeyConstraintName: 'fk_fridge_items_unit' })
  unit?: Relation<Unit>;

  /** Ngày hết hạn, dạng 'YYYY-MM-DD'. */
  @Index('idx_fridge_items_expiry_date')
  @Column({ type: 'date' })
  expiryDate!: IsoDate;

  @Column({ type: 'enum', enum: StorageLocation })
  storageLocation!: StorageLocation;

  @Column(moneyColumn({ nullable: true }))
  purchasedPrice!: number | null;

  /** Số ngày còn lại đến hạn (âm khi đã quá hạn). @br BR-01 */
  daysUntilExpiry(today: IsoDate): number {
    return daysBetween(today, this.expiryDate);
  }

  /** Còn hàng trong kho không. @br BR-03 */
  isInStock(): boolean {
    return this.quantity > 0;
  }

  /**
   * Trạng thái hiện tại của lô thực phẩm.
   * - Hết hàng: DISCARDED nếu giao dịch cuối là huỷ, ngược lại CONSUMED.
   * - Còn hàng (BR-01): còn ≤ 0 ngày → EXPIRED; 0 < còn ≤ 3 ngày → EXPIRING_SOON; còn lại FRESH.
   * @uc UC-FRIDGE-02, UC-FRIDGE-04  @fr FR-10  @br BR-01
   */
  getState(today: IsoDate, lastTransactionType?: InventoryTransactionType): FridgeItemState {
    if (!this.isInStock()) {
      return lastTransactionType === InventoryTransactionType.Discard
        ? FridgeItemState.Discarded
        : FridgeItemState.Consumed;
    }
    const daysLeft = this.daysUntilExpiry(today);
    if (daysLeft <= 0) {
      return FridgeItemState.Expired;
    }
    if (daysLeft <= EXPIRY_SOON_DAYS) {
      return FridgeItemState.ExpiringSoon;
    }
    return FridgeItemState.Fresh;
  }

  /**
   * Trừ số lượng khi dùng/huỷ; không cho phép tồn âm. Trả về lượng thực trừ.
   * FridgeService ghi inventory_transactions tương ứng (CONSUME/DISCARD).
   * @uc UC-FRIDGE-03  @fr FR-13  @br BR-03, BR-05
   */
  decrease(amount: number): number {
    if (!(amount > 0)) {
      throw new InvalidQuantityException('Số lượng sử dụng phải lớn hơn 0.', { amount });
    }
    if (amount > this.quantity) {
      throw new InsufficientStockException({
        fridgeItemId: this.id,
        name: this.name,
        available: this.quantity,
        requested: amount,
        unitId: this.unitId,
      });
    }
    this.quantity = Number((this.quantity - amount).toFixed(3));
    return amount;
  }

  /**
   * Cộng thêm số lượng (nhập bổ sung cùng lô).
   * @uc UC-FRIDGE-01  @fr FR-09
   */
  increase(amount: number): void {
    if (!(amount > 0)) {
      throw new InvalidQuantityException('Số lượng nhập phải lớn hơn 0.', { amount });
    }
    this.quantity = Number((this.quantity + amount).toFixed(3));
  }
}
