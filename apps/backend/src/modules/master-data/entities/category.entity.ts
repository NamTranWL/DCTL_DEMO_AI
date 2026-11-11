import { Check, Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';

/**
 * Danh mục thực phẩm (master data): rau củ, thịt cá, đồ khô, gia vị…
 * Mang gợi ý bảo quản (FR-11) và hạn dùng mặc định khi nhập kho từ danh sách mua (BR-02).
 * Table: categories.
 * @uc UC-ADM-02  @fr FR-05, FR-11, FR-25  @br BR-02, BR-04
 */
@Entity('categories')
@Unique('uq_categories_name', ['name'])
@Check('chk_categories_default_shelf_life_days', '"default_shelf_life_days" >= 0')
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /** Gợi ý cách bảo quản hiển thị cho người dùng (FR-11). */
  @Column({ type: 'text', nullable: true })
  storageAdvice!: string | null;

  /** Số ngày dùng được mặc định kể từ ngày nhập kho (BR-02). */
  @Column({ type: 'int' })
  defaultShelfLifeDays!: number;
}
