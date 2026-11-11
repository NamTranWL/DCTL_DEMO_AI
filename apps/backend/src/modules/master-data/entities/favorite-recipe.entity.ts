import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Recipe } from './recipe.entity';

/**
 * Công thức yêu thích của người dùng — bảng nối N–N users ↔ recipes, khoá chính ghép.
 * Khai báo thành entity tường minh (thay vì @ManyToMany trên User) để module `users`
 * không phụ thuộc `master-data` (tránh phụ thuộc vòng).
 * Table: favorite_recipes.
 * @uc UC-RCP-01  @fr FR-17
 */
@Entity('favorite_recipes')
export class FavoriteRecipe {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_favorite_recipes' })
  userId!: string;

  @Index('idx_favorite_recipes_recipe_id')
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_favorite_recipes' })
  recipeId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_favorite_recipes_user' })
  user?: Relation<User>;

  @ManyToOne(() => Recipe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipe_id', foreignKeyConstraintName: 'fk_favorite_recipes_recipe' })
  recipe?: Relation<Recipe>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
