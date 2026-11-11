import { type FridgeItemsChangedPayload, REALTIME_EVENTS } from '@dctl/shared';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeService } from '../../../infrastructure/realtime/realtime.service';
import {
  FRIDGE_ITEM_UPDATED,
  FRIDGE_ITEMS_ADDED,
  FRIDGE_ITEMS_CONSUMED,
  FRIDGE_ITEMS_DISCARDED,
  FridgeItemsAddedEvent,
  FridgeItemsConsumedEvent,
  FridgeItemsDiscardedEvent,
  FridgeItemUpdatedEvent,
} from '../events';

/**
 * Observer: sự kiện domain của kho → `fridge:items-changed` tới room gia đình (BR-06), để màn
 * hình kho của mọi thành viên tải lại. Lỗi realtime chỉ ghi log, không ảnh hưởng thao tác REST.
 * @uc UC-FRIDGE-01, UC-FRIDGE-02, UC-FRIDGE-03  @fr FR-09, FR-13  @br BR-06
 */
@Injectable()
export class FridgeRealtimeListener {
  private readonly logger = new Logger(FridgeRealtimeListener.name);

  constructor(private readonly realtime: RealtimeService) {}

  /** Lô mới / cộng dồn (nhập thủ công hoặc từ chuyến đi chợ). @uc UC-FRIDGE-01  @fr FR-08 */
  @OnEvent(FRIDGE_ITEMS_ADDED, { async: true })
  onAdded(event: FridgeItemsAddedEvent): void {
    this.publish(event.familyId, {
      reason: 'added',
      source: event.source,
      fridgeItemIds: event.fridgeItemIds,
      actorId: event.actorId,
    });
  }

  /** Đã dùng (FEFO). @uc UC-FRIDGE-03  @fr FR-13 */
  @OnEvent(FRIDGE_ITEMS_CONSUMED, { async: true })
  onConsumed(event: FridgeItemsConsumedEvent): void {
    this.publish(event.familyId, {
      reason: 'consumed',
      fridgeItemIds: event.changes.map((c) => c.fridgeItemId),
      actorId: event.actorId,
    });
  }

  /** Đã huỷ (lãng phí). @uc UC-FRIDGE-03  @br BR-05 */
  @OnEvent(FRIDGE_ITEMS_DISCARDED, { async: true })
  onDiscarded(event: FridgeItemsDiscardedEvent): void {
    this.publish(event.familyId, {
      reason: 'discarded',
      fridgeItemIds: event.changes.map((c) => c.fridgeItemId),
      actorId: event.actorId,
    });
  }

  /** Sửa hạn/vị trí/giá. @uc UC-FRIDGE-01  @br BR-02 */
  @OnEvent(FRIDGE_ITEM_UPDATED, { async: true })
  onUpdated(event: FridgeItemUpdatedEvent): void {
    this.publish(event.familyId, {
      reason: 'updated',
      fridgeItemIds: [event.fridgeItemId],
      actorId: event.actorId,
    });
  }

  private publish(familyId: string, payload: FridgeItemsChangedPayload): void {
    try {
      this.realtime.emitToFamily(familyId, REALTIME_EVENTS.FRIDGE_ITEMS_CHANGED, payload);
    } catch (error: unknown) {
      this.logger.error(
        `Realtime fridge broadcast failed for family ${familyId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
