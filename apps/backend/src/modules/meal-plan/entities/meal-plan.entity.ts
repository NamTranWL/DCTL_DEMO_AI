import { PeriodType } from '@dctl/shared';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { type IsoDate } from '../../../common/utils/date.util';
import { BaseEntity } from '../../../database/base.entity';
import { Family } from '../../families/entities/family.entity';
import { MealPlanEntry } from './meal-plan-entry.entity';

/**
 * Kế hoạch bữa ăn (thực đơn) của gia đình cho một ngày hoặc một tuần.
 * Table: meal_plans.
 * @uc UC-MEAL-01, UC-MEAL-02  @fr FR-14, FR-15  @br BR-06
 */
@Entity('meal_plans')
@Index('idx_meal_plans_family_id_start_date', ['familyId', 'startDate'])
@Check('chk_meal_plans_dates', '"end_date" >= "start_date"')
export class MealPlan extends BaseEntity {
  @Index('idx_meal_plans_family_id')
  @Column({ type: 'uuid' })
  familyId!: string;

  @ManyToOne(() => Family, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id', foreignKeyConstraintName: 'fk_meal_plans_family' })
  family?: Relation<Family>;

  @Column({ type: 'enum', enum: PeriodType, default: PeriodType.Day })
  periodType!: PeriodType;

  @Column({ type: 'date' })
  startDate!: IsoDate;

  @Column({ type: 'date' })
  endDate!: IsoDate;

  @OneToMany(() => MealPlanEntry, (entry) => entry.mealPlan)
  entries?: Relation<MealPlanEntry[]>;

  /** Ngày có nằm trong kỳ thực đơn không. @uc UC-MEAL-01 */
  covers(date: IsoDate): boolean {
    return date >= this.startDate && date <= this.endDate;
  }
}
