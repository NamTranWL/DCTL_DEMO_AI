import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Common columns of every table with a surrogate key: id (uuid), created_at, updated_at.
 * Not to be confused with TypeORM's active-record `BaseEntity` (forbidden by ESLint):
 * this project uses the Repository pattern only.
 *
 * Exceptions (natural keys, see PROJECT_CONTEXT.md §11):
 * - dietary_profiles: PK = user_id (1–1 with users)
 * - favorite_recipes: PK = (user_id, recipe_id)
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
