import { NotificationType } from '@dctl/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Thông báo gửi tới một người dùng (nhắc hạn dùng, phân công mua, kiểm duyệt…).
 * ref_id trỏ tới đối tượng liên quan (fridge_item, shopping_list…) tuỳ theo type, không có FK.
 * Table: notifications.
 * @uc UC-FRIDGE-04  @fr FR-10  @br BR-01
 */
@Entity('notifications')
@Index('idx_notifications_user_id_created_at', ['userId', 'createdAt'])
export class Notification extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_notifications_user' })
  user?: Relation<User>;

  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType;

  /** Nội dung hiển thị (tiếng Việt). */
  @Column({ type: 'text' })
  content!: string;

  @Index('idx_notifications_ref_id')
  @Column({ type: 'uuid', nullable: true })
  refId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  /** Người dùng đã đọc chưa. @uc UC-FRIDGE-04 */
  isRead(): boolean {
    return this.readAt !== null;
  }

  /** Đánh dấu đã đọc (gọi nhiều lần vẫn giữ thời điểm đọc đầu tiên). @uc UC-FRIDGE-04  @fr FR-10 */
  markAsRead(at: Date = new Date()): void {
    if (this.readAt === null) {
      this.readAt = at;
    }
  }
}
