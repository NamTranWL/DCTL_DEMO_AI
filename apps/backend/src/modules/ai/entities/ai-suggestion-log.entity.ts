import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Nhật ký mỗi lần gợi ý món bằng AI: yêu cầu, phản hồi, kết quả hậu kiểm, độ trễ,
 * có dùng cache/fallback không (§8 bước 6). Dùng cho giám sát lượt gọi AI (FR-27)
 * và đánh giá chất lượng gợi ý.
 * Table: ai_suggestion_logs.
 * @uc UC-AI-01, UC-ADM-04  @fr FR-18, FR-27
 */
@Entity('ai_suggestion_logs')
export class AiSuggestionLog extends BaseEntity {
  @Index('idx_ai_suggestion_logs_user_id')
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_ai_suggestion_logs_user' })
  user?: Relation<User> | null;

  /** Ảnh chụp kho + ràng buộc gửi đi (prompt input). */
  @Column({ type: 'jsonb' })
  requestJson!: Record<string, unknown>;

  /** Phản hồi thô của LLM; NULL khi lỗi/timeout. */
  @Column({ type: 'jsonb', nullable: true })
  responseJson!: Record<string, unknown> | null;

  /** Kết quả hậu kiểm: lỗi schema, món bị loại (dị ứng, nguyên liệu lạ)… */
  @Column({ type: 'jsonb', nullable: true })
  validationResult!: Record<string, unknown> | null;

  @Column({ type: 'int' })
  latencyMs!: number;

  @Column({ type: 'boolean', default: false })
  cacheHit!: boolean;

  @Column({ type: 'boolean', default: false })
  usedFallback!: boolean;
}
