import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { quantityColumn } from '../../../database/transformers';
import { Category } from './category.entity';
import { Food } from './food.entity';
import { Recipe } from './recipe.entity';
import { Unit } from './unit.entity';

/**
 * Một nguyên liệu của công thức. Có id riêng (quyết định B3: §11 ghi recipe_id là PK
 * sẽ chỉ cho phép 1 nguyên liệu/công thức). food_id dùng để đối chiếu tồn kho và tính
 * nguyên liệu thiếu phía server (BR-10); ingredient_name là tên hiển thị.
 * Table: recipe_ingredients.
 * @uc UC-RCP-01, UC-AI-01  @fr FR-17, FR-19  @br BR-10
 */
@Entity('recipe_ingredients')
@Check('chk_recipe_ingredients_quantity', '"quantity" > 0')
export class RecipeIngredient extends BaseEntity {
  @Index('idx_recipe_ingredients_recipe_id')
  @Column({ type: 'uuid' })
  recipeId!: string;

  @ManyToOne(() => Recipe, (recipe) => recipe.ingredients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipe_id', foreignKeyConstraintName: 'fk_recipe_ingredients_recipe' })
  recipe?: Relation<Recipe>;

  @Index('idx_recipe_ingredients_food_id')
  @Column({ type: 'uuid', nullable: true })
  foodId!: string | null;

  @ManyToOne(() => Food, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'food_id', foreignKeyConstraintName: 'fk_recipe_ingredients_food' })
  food?: Relation<Food> | null;

  @Column({ type: 'varchar', length: 150 })
  ingredientName!: string;

  @Column({ type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_recipe_ingredients_category' })
  category?: Relation<Category> | null;

  @Column(quantityColumn())
  quantity!: number;

  @Column({ type: 'uuid' })
  unitId!: string;

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id', foreignKeyConstraintName: 'fk_recipe_ingredients_unit' })
  unit?: Relation<Unit>;
}
