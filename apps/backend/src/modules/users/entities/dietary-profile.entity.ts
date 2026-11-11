import { type AllergyEntry } from '@dctl/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Hồ sơ ăn uống: khẩu vị, dị ứng, mục tiêu dinh dưỡng — ràng buộc cho gợi ý AI.
 * Table: dietary_profiles. PK = user_id (quan hệ 1–1 với users), không dùng BaseEntity.
 * @uc UC-FAM-02  @fr FR-02  @br BR-07
 */
@Entity('dietary_profiles')
export class DietaryProfile {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_dietary_profiles' })
  userId!: string;

  @OneToOne(() => User, (user) => user.dietaryProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_dietary_profiles_user' })
  user?: Relation<User>;

  /** Danh sách chất/thực phẩm gây dị ứng; khớp theo foodId hoặc tên chuẩn hoá (BR-07). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  allergies!: AllergyEntry[];

  /** Khẩu vị, vd: "không cay", "ít ngọt". */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tastePreferences!: string[];

  /** Mục tiêu dinh dưỡng, vd: "giảm cân", "ít tinh bột". */
  @Column({ type: 'varchar', length: 255, nullable: true })
  nutritionGoal!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
