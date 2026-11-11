import { REALTIME_EVENTS } from '@dctl/shared';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeService } from '../../../infrastructure/realtime/realtime.service';
import {
  FAMILY_CREATED,
  FAMILY_DISSOLVED,
  FAMILY_MEMBER_JOINED,
  FAMILY_MEMBER_LEFT,
  FAMILY_MEMBER_REMOVED,
  FAMILY_OWNERSHIP_TRANSFERRED,
  type FamilyCreatedEvent,
  type FamilyDissolvedEvent,
  type FamilyMemberJoinedEvent,
  type FamilyMemberLeftEvent,
  type FamilyMemberRemovedEvent,
  type FamilyOwnershipTransferredEvent,
} from '../events';

/**
 * Observer: đồng bộ room Socket.IO theo thay đổi thành viên gia đình, để người vừa tham gia
 * nhận ngay sự kiện của gia đình và người rời/bị xoá không còn nhận (BR-06), rồi báo cho app.
 * Lỗi realtime chỉ được ghi log, không làm hỏng thao tác REST đã thành công.
 * @uc UC-FAM-01  @fr FR-03, FR-06  @br BR-06, BR-11
 */
@Injectable()
export class FamilyRealtimeListener {
  private readonly logger = new Logger(FamilyRealtimeListener.name);

  constructor(private readonly realtime: RealtimeService) {}

  /** Chủ gia đình vào room gia đình mới. @uc UC-FAM-01 */
  @OnEvent(FAMILY_CREATED, { async: true })
  onCreated(event: FamilyCreatedEvent): void {
    this.safely(() => {
      this.realtime.joinFamilyRoom(event.ownerId, event.familyId);
      this.realtime.emitToUser(event.ownerId, REALTIME_EVENTS.USER_FAMILY_CHANGED, {
        familyId: event.familyId,
        reason: 'created',
      });
    });
  }

  /** Thành viên mới vào room; cả nhà được báo danh sách thành viên đổi. @uc UC-FAM-01  @br BR-11 */
  @OnEvent(FAMILY_MEMBER_JOINED, { async: true })
  onJoined(event: FamilyMemberJoinedEvent): void {
    this.safely(() => {
      this.realtime.joinFamilyRoom(event.userId, event.familyId);
      this.realtime.emitToUser(event.userId, REALTIME_EVENTS.USER_FAMILY_CHANGED, {
        familyId: event.familyId,
        reason: 'joined',
      });
      this.realtime.emitToFamily(event.familyId, REALTIME_EVENTS.FAMILY_MEMBERS_CHANGED, {
        familyId: event.familyId,
        change: 'joined',
        userId: event.userId,
      });
    });
  }

  /** Người bị xoá ra khỏi room ngay lập tức. @uc UC-FAM-01  @br BR-06 */
  @OnEvent(FAMILY_MEMBER_REMOVED, { async: true })
  onRemoved(event: FamilyMemberRemovedEvent): void {
    this.safely(() => this.memberGone(event.familyId, event.userId, 'removed'));
  }

  /** Người rời gia đình ra khỏi room. @uc UC-FAM-01  @br BR-06 */
  @OnEvent(FAMILY_MEMBER_LEFT, { async: true })
  onLeft(event: FamilyMemberLeftEvent): void {
    this.safely(() => this.memberGone(event.familyId, event.userId, 'left'));
  }

  /** Báo cả nhà quyền chủ đã chuyển. @uc UC-FAM-01 */
  @OnEvent(FAMILY_OWNERSHIP_TRANSFERRED, { async: true })
  onOwnershipTransferred(event: FamilyOwnershipTransferredEvent): void {
    this.safely(() =>
      this.realtime.emitToFamily(event.familyId, REALTIME_EVENTS.FAMILY_MEMBERS_CHANGED, {
        familyId: event.familyId,
        change: 'ownership-transferred',
        userId: event.newOwnerId,
      }),
    );
  }

  /** Gia đình bị giải tán: người cuối rời room. @uc UC-FAM-01 */
  @OnEvent(FAMILY_DISSOLVED, { async: true })
  onDissolved(event: FamilyDissolvedEvent): void {
    this.safely(() => {
      this.realtime.leaveFamilyRoom(event.lastOwnerId, event.familyId);
      this.realtime.emitToUser(event.lastOwnerId, REALTIME_EVENTS.USER_FAMILY_CHANGED, {
        familyId: null,
        reason: 'dissolved',
      });
    });
  }

  private memberGone(familyId: string, userId: string, reason: 'removed' | 'left'): void {
    this.realtime.leaveFamilyRoom(userId, familyId);
    this.realtime.emitToUser(userId, REALTIME_EVENTS.USER_FAMILY_CHANGED, {
      familyId: null,
      reason,
    });
    this.realtime.emitToFamily(familyId, REALTIME_EVENTS.FAMILY_MEMBERS_CHANGED, {
      familyId,
      change: reason,
      userId,
    });
  }

  private safely(work: () => void): void {
    try {
      work();
    } catch (error: unknown) {
      this.logger.error(
        'Realtime membership sync failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
