import { PushPlatform } from '@dctl/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Push token (Expo) của một thiết bị đã đăng nhập (bổ sung B6 — §11 chưa có bảng này).
 * Một token chỉ thuộc một người dùng: đăng nhập tài khoản khác trên cùng máy → token chuyển chủ.
 * Table: push_tokens.
 * @uc UC-FRIDGE-04  @fr FR-10
 */
@Entity('push_tokens')
@Unique('uq_push_tokens_token', ['token'])
export class PushToken extends BaseEntity {
  @Index('idx_push_tokens_user_id')
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_push_tokens_user' })
  user?: Relation<User>;

  /** Expo push token, e.g. `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`. */
  @Column({ type: 'varchar', length: 255 })
  token!: string;

  @Column({ type: 'enum', enum: PushPlatform })
  platform!: PushPlatform;
}
