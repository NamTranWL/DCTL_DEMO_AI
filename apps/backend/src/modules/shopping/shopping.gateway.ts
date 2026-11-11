import { REALTIME_EVENTS, type RealtimeEventPayloads } from '@dctl/shared';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import {
  SHOPPING_ITEM_ADDED,
  SHOPPING_ITEM_REMOVED,
  SHOPPING_ITEM_UPDATED,
  SHOPPING_LIST_CREATED,
  SHOPPING_LIST_DELETED,
  SHOPPING_LIST_UPDATED,
  SHOPPING_TRIP_COMPLETED,
  ShoppingItemAddedEvent,
  ShoppingItemRemovedEvent,
  ShoppingItemUpdatedEvent,
  ShoppingListChangedEvent,
  ShoppingListDeletedEvent,
  ShoppingTripCompletedEvent,
} from './events';

/**
 * ShoppingGateway (boundary realtime, §10): nhận sự kiện domain của ShoppingService (Observer)
 * và phát tới room `family:{familyId}` của đúng gia đình (BR-06), để mọi thành viên thấy danh
 * sách/mặt hàng thay đổi tức thì (FR-06, FR-07; NFR §9: < 2 s).
 * Xác thực JWT khi handshake và join room do RealtimeGateway dùng chung (B6) đảm nhận; client
 * chỉ NHẬN qua socket, mọi thay đổi gửi qua REST (có version — quyết định B6/B7).
 * Lỗi realtime chỉ ghi log, không làm hỏng thao tác REST đã commit.
 * @uc UC-SHOP-01, UC-SHOP-02, UC-SHOP-03  @fr FR-06, FR-07, FR-08  @br BR-06
 */
@Injectable()
export class ShoppingGateway {
  private readonly logger = new Logger(ShoppingGateway.name);

  constructor(private readonly realtime: RealtimeService) {}

  /** Danh sách mới → chia sẻ cho cả nhà (5.1 bước 2). @uc UC-SHOP-01  @fr FR-06 */
  @OnEvent(SHOPPING_LIST_CREATED, { async: true })
  onListCreated(event: ShoppingListChangedEvent): void {
    this.broadcast(event.familyId, REALTIME_EVENTS.SHOPPING_LIST_CREATED, {
      list: event.list,
      actorId: event.actorId,
    });
  }

  /** Đổi ngày/kỳ hoặc Nháp → Đang mua. @uc UC-SHOP-01, UC-SHOP-03  @fr FR-07 */
  @OnEvent(SHOPPING_LIST_UPDATED, { async: true })
  onListUpdated(event: ShoppingListChangedEvent): void {
    this.broadcast(event.familyId, REALTIME_EVENTS.SHOPPING_LIST_UPDATED, {
      list: event.list,
      actorId: event.actorId,
    });
  }

  /** Danh sách bị xoá. @uc UC-SHOP-01 */
  @OnEvent(SHOPPING_LIST_DELETED, { async: true })
  onListDeleted(event: ShoppingListDeletedEvent): void {
    this.broadcast(event.familyId, REALTIME_EVENTS.SHOPPING_LIST_DELETED, {
      listId: event.listId,
      actorId: event.actorId,
    });
  }

  /** Mặt hàng mới. @uc UC-SHOP-01  @fr FR-06 */
  @OnEvent(SHOPPING_ITEM_ADDED, { async: true })
  onItemAdded(event: ShoppingItemAddedEvent): void {
    this.broadcast(event.familyId, REALTIME_EVENTS.SHOPPING_ITEM_ADDED, {
      item: event.item,
      actorId: event.actorId,
    });
  }

  /** Sửa / phân công / đã mua / hoàn tác (5.1 bước 4). @uc UC-SHOP-03  @fr FR-03, FR-07 */
  @OnEvent(SHOPPING_ITEM_UPDATED, { async: true })
  onItemUpdated(event: ShoppingItemUpdatedEvent): void {
    this.broadcast(event.familyId, REALTIME_EVENTS.SHOPPING_ITEM_UPDATED, {
      item: event.item,
      change: event.change,
      actorId: event.actorId,
    });
  }

  /** Mặt hàng bị xoá. @uc UC-SHOP-01 */
  @OnEvent(SHOPPING_ITEM_REMOVED, { async: true })
  onItemRemoved(event: ShoppingItemRemovedEvent): void {
    this.broadcast(event.familyId, REALTIME_EVENTS.SHOPPING_ITEM_REMOVED, {
      listId: event.listId,
      itemId: event.itemId,
      actorId: event.actorId,
    });
  }

  /** Hoàn tất chuyến đi chợ, đã nhập kho (5.1 bước 8). @uc UC-SHOP-03  @fr FR-08  @br BR-02 */
  @OnEvent(SHOPPING_TRIP_COMPLETED, { async: true })
  onTripCompleted(event: ShoppingTripCompletedEvent): void {
    this.broadcast(event.familyId, REALTIME_EVENTS.SHOPPING_TRIP_COMPLETED, {
      list: event.list,
      importedItemIds: event.importedItemIds,
      fridgeItemIds: event.fridgeItemIds,
      pendingItemCount: event.pendingItemCount,
      actorId: event.actorId,
    });
  }

  private broadcast<E extends keyof RealtimeEventPayloads>(
    familyId: string,
    event: E,
    payload: RealtimeEventPayloads[E],
  ): void {
    try {
      this.realtime.emitToFamily(familyId, event, payload);
    } catch (error: unknown) {
      this.logger.error(
        `Realtime ${event} failed for family ${familyId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
