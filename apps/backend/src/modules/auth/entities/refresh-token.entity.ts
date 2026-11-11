import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Refresh token đã cấp (bổ sung B4). Chỉ lưu SHA-256 của token, không lưu token gốc.
 * Mỗi lần làm mới, token cũ bị thu hồi và thay bằng token mới (rotation); dùng lại một token
 * đã thu hồi được coi là bị lộ → thu hồi toàn bộ token của người dùng đó.
 * Table: refresh_tokens.
 * @uc UC-AUTH-02  @fr FR-01
 */
@Entity('refresh_tokens')
@Unique('uq_refresh_tokens_token_hash', ['tokenHash'])
export class RefreshToken extends BaseEntity {
  @Index('idx_refresh_tokens_user_id')
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_refresh_tokens_user' })
  user?: Relation<User>;

  /** Hex SHA-256 of the opaque token sent to the client. */
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** Token có còn dùng được không (chưa thu hồi, chưa hết hạn). */
  isActive(now: Date = new Date()): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() > now.getTime();
  }

  /** Thu hồi token (đăng xuất, xoay vòng, đổi mật khẩu); gọi lại không đổi thời điểm. */
  revoke(at: Date = new Date()): void {
    if (this.revokedAt === null) {
      this.revokedAt = at;
    }
  }
}
