import { ApprovalStatus, type NutritionInfo, RecipeSource } from '@dctl/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { assertTransition } from '../../../common/exceptions/domain.exceptions';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/entities/user.entity';
import { RecipeIngredient } from './recipe-ingredient.entity';

/** State machine of a contributed recipe: PENDING → APPROVED | REJECTED (§10). */
export const RECIPE_APPROVAL_TRANSITIONS: Readonly<
  Record<ApprovalStatus, readonly ApprovalStatus[]>
> = {
  [ApprovalStatus.Pending]: [ApprovalStatus.Approved, ApprovalStatus.Rejected],
  [ApprovalStatus.Approved]: [],
  [ApprovalStatus.Rejected]: [],
};

/**
 * Công thức món ăn: nguyên liệu, cách chế biến, thông tin dinh dưỡng.
 * Công thức chuẩn (SYSTEM) do Admin quản lý; công thức người dùng đóng góp (USER)
 * chỉ công khai sau khi Admin duyệt (BR-08). Là nguồn cho gợi ý dự phòng của AI (§8).
 * Table: recipes.
 * @uc UC-RCP-01, UC-ADM-02, UC-ADM-03, UC-AI-01  @fr FR-17, FR-25, FR-26  @br BR-08
 */
@Entity('recipes')
export class Recipe extends BaseEntity {
  @Index('idx_recipes_name')
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  /** Các bước chế biến, mỗi bước một dòng. */
  @Column({ type: 'text' })
  instructions!: string;

  @Column({ type: 'jsonb', nullable: true })
  nutritionInfo!: NutritionInfo | null;

  @Column({ type: 'enum', enum: RecipeSource, default: RecipeSource.User })
  source!: RecipeSource;

  @Index('idx_recipes_approval_status')
  @Column({
    type: 'enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.Pending,
  })
  approvalStatus!: ApprovalStatus;

  /** Người đóng góp; NULL với công thức chuẩn của hệ thống. */
  @Index('idx_recipes_created_by')
  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'fk_recipes_created_by' })
  creator?: Relation<User> | null;

  @OneToMany(() => RecipeIngredient, (ingredient) => ingredient.recipe, { cascade: ['insert'] })
  ingredients?: Relation<RecipeIngredient[]>;

  /** Công thức có được hiển thị công khai không. @br BR-08 */
  isPublic(): boolean {
    return this.approvalStatus === ApprovalStatus.Approved;
  }

  /** Admin duyệt công thức đóng góp. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  approve(): void {
    assertTransition(
      'Recipe',
      RECIPE_APPROVAL_TRANSITIONS,
      this.approvalStatus,
      ApprovalStatus.Approved,
    );
    this.approvalStatus = ApprovalStatus.Approved;
  }

  /** Admin từ chối công thức đóng góp. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  reject(): void {
    assertTransition(
      'Recipe',
      RECIPE_APPROVAL_TRANSITIONS,
      this.approvalStatus,
      ApprovalStatus.Rejected,
    );
    this.approvalStatus = ApprovalStatus.Rejected;
  }
}
