import {
  type ShoppingItemChange,
  type ShoppingItemSnapshot,
  type ShoppingListSnapshot,
} from '@dctl/shared';

/**
 * Domain events of the shopping module (Observer pattern, §10). Emitted by ShoppingService
 * AFTER the transaction commits; they carry the committed snapshots. Listeners:
 * ShoppingGateway → realtime room `family:{id}` (FR-06, FR-07); B8: notifications (FR-03 assign).
 * Fridge import is NOT a listener: completeTrip calls FridgeService.addItems() inside its own
 * transaction (decision B7) and emits SHOPPING_TRIP_COMPLETED once both are committed.
 */

export const SHOPPING_LIST_CREATED = 'shopping.list.created';
export const SHOPPING_LIST_UPDATED = 'shopping.list.updated';
export const SHOPPING_LIST_DELETED = 'shopping.list.deleted';
export const SHOPPING_ITEM_ADDED = 'shopping.item.added';
export const SHOPPING_ITEM_UPDATED = 'shopping.item.updated';
export const SHOPPING_ITEM_REMOVED = 'shopping.item.removed';
export const SHOPPING_TRIP_COMPLETED = 'shopping.trip.completed';

/** Danh sách được tạo / đổi ngày, kỳ, hoặc chuyển Nháp → Đang mua. @uc UC-SHOP-01  @fr FR-04, FR-06 */
export class ShoppingListChangedEvent {
  constructor(
    readonly familyId: string,
    readonly list: ShoppingListSnapshot,
    readonly actorId: string,
  ) {}
}

/** Danh sách bị xoá. @uc UC-SHOP-01 */
export class ShoppingListDeletedEvent {
  constructor(
    readonly familyId: string,
    readonly listId: string,
    readonly actorId: string,
  ) {}
}

/** Mặt hàng được thêm. @uc UC-SHOP-01  @fr FR-05, FR-06 */
export class ShoppingItemAddedEvent {
  constructor(
    readonly familyId: string,
    readonly item: ShoppingItemSnapshot,
    readonly actorId: string,
  ) {}
}

/**
 * Mặt hàng được sửa / phân công / đánh dấu đã mua / hoàn tác ("ShoppingItemUpdated", §10).
 * `previousAssigneeId` lets B8 notify a newly assigned member (FR-03).
 * @uc UC-SHOP-01, UC-SHOP-03  @fr FR-03, FR-07
 */
export class ShoppingItemUpdatedEvent {
  constructor(
    readonly familyId: string,
    readonly item: ShoppingItemSnapshot,
    readonly change: ShoppingItemChange,
    readonly actorId: string,
    readonly previousAssigneeId: string | null = null,
  ) {}
}

/** Mặt hàng bị xoá khỏi danh sách. @uc UC-SHOP-01 */
export class ShoppingItemRemovedEvent {
  constructor(
    readonly familyId: string,
    readonly listId: string,
    readonly itemId: string,
    readonly actorId: string,
  ) {}
}

/**
 * Hoàn tất chuyến đi chợ ("ShoppingTripCompleted", §10): danh sách COMPLETED và các mặt hàng
 * đã mua đã vào kho (cùng một transaction). @uc UC-SHOP-03  @fr FR-08  @br BR-02
 */
export class ShoppingTripCompletedEvent {
  constructor(
    readonly familyId: string,
    readonly list: ShoppingListSnapshot,
    readonly importedItemIds: string[],
    readonly fridgeItemIds: string[],
    readonly pendingItemCount: number,
    readonly actorId: string,
  ) {}
}
