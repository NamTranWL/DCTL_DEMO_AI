import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { numericTransformer } from '../../../database/transformers';

/**
 * Đơn vị tính (master data). Quy đổi chỉ trong cùng nhóm đơn vị (BR-04):
 * - Đơn vị gốc (g, ml, quả…): base_unit_id = NULL, factor_to_base = 1.
 * - Đơn vị dẫn xuất (kg, l…): base_unit_id = đơn vị gốc, factor_to_base = hệ số (kg → 1000 g).
 * Table: units.
 * @uc UC-ADM-02  @fr FR-25  @br BR-04
 */
@Entity('units')
@Unique('uq_units_symbol', ['symbol'])
@Check('chk_units_factor_to_base', '"factor_to_base" > 0')
export class Unit extends BaseEntity {
  /** Ký hiệu hiển thị, vd: "kg", "quả". */
  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Index('idx_units_base_unit_id')
  @Column({ type: 'uuid', nullable: true })
  baseUnitId!: string | null;

  @ManyToOne(() => Unit, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'base_unit_id', foreignKeyConstraintName: 'fk_units_base_unit' })
  baseUnit?: Relation<Unit> | null;

  /** Số đơn vị gốc trong 1 đơn vị này (kg → 1000). */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    default: 1,
    transformer: numericTransformer,
  })
  factorToBase!: number;

  /** id của đơn vị gốc trong nhóm (chính nó nếu là đơn vị gốc). @br BR-04 */
  get groupId(): string {
    return this.baseUnitId ?? this.id;
  }

  /** Hai đơn vị có cùng nhóm (quy đổi được) không. @br BR-04 */
  isConvertibleTo(other: Unit): boolean {
    return this.groupId === other.groupId;
  }
}
