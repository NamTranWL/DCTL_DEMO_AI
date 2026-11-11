import { InventoryTransactionType } from '@dctl/shared';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { quantityColumn } from '../../../database/transformers';
import { User } from '../../users/entities/user.entity';
import { FridgeItem } from './fridge-item.entity';

/**
 * Nhật ký thay đổi tồn kho: nhập (ADD), dùng (CONSUME), huỷ (DISCARD — lãng phí, BR-05),
 * điều chỉnh (ADJUST). Là nguồn dữ liệu cho báo cáo tiêu thụ/lãng phí (FR-22, FR-23)
 * và dự đoán tiêu thụ (FR-29). Chỉ thêm mới, không sửa/xoá.
 * Table: inventory_transactions.
 * @uc UC-FRIDGE-01, UC-FRIDGE-03, UC-RPT-01  @fr FR-13, FR-22, FR-23  @br BR-03, BR-05
 */
@Entity('inventory_transactions')
@Index('idx_inventory_transactions_type_created_at', ['type', 'createdAt'])
@Check('chk_inventory_transactions_quantity', '"quantity" > 0')
export class InventoryTransaction extends BaseEntity {
  @Index('idx_inventory_transactions_fridge_item_id')
  @Column({ type: 'uuid' })
  fridgeItemId!: string;

  @ManyToOne(() => FridgeItem, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'fridge_item_id',
    foreignKeyConstraintName: 'fk_inventory_transactions_fridge_item',
  })
  fridgeItem?: Relation<FridgeItem>;

  @Column({
    type: 'enum',
    enum: InventoryTransactionType,
  })
  type!: InventoryTransactionType;

  /** Lượng thay đổi (luôn dương), cùng đơn vị với fridge_items.unit_id. */
  @Column(quantityColumn())
  quantity!: number;

  /** Người thực hiện; NULL khi do hệ thống (vd: tự nhập kho). */
  @Index('idx_inventory_transactions_user_id')
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_inventory_transactions_user' })
  user?: Relation<User> | null;
}
