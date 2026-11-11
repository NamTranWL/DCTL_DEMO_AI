import { MealType } from '@dctl/shared';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { type IsoDate } from '../../../common/utils/date.util';
import { BaseEntity } from '../../../database/base.entity';
import { Recipe } from '../../master-data/entities/recipe.entity';
import { MealPlan } from './meal-plan.entity';

/**
 * Một món trong thực đơn: ngày + bữa + công thức + số khẩu phần.
 * Table: meal_plan_entries.
 * @uc UC-MEAL-01, UC-MEAL-02, UC-AI-01  @fr FR-14, FR-15, FR-16
 */
@Entity('meal_plan_entries')
@Index('idx_meal_plan_entries_meal_plan_id_date', ['mealPlanId', 'date'])
@Check('chk_meal_plan_entries_servings', '"servings" > 0')
export class MealPlanEntry extends BaseEntity {
  @Column({ type: 'uuid' })
  mealPlanId!: string;

  @ManyToOne(() => MealPlan, (plan) => plan.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meal_plan_id', foreignKeyConstraintName: 'fk_meal_plan_entries_meal_plan' })
  mealPlan?: Relation<MealPlan>;

  @Column({ type: 'date' })
  date!: IsoDate;

  @Column({ type: 'enum', enum: MealType })
  mealType!: MealType;

  @Index('idx_meal_plan_entries_recipe_id')
  @Column({ type: 'uuid' })
  recipeId!: string;

  @ManyToOne(() => Recipe, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recipe_id', foreignKeyConstraintName: 'fk_meal_plan_entries_recipe' })
  recipe?: Relation<Recipe>;

  @Column({ type: 'int', default: 1 })
  servings!: number;
}
