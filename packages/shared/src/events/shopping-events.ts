import { type PeriodType, type ShoppingListItemStatus, type ShoppingListStatus } from '../enums';

/**
 * Realtime events of the shopping module (B7) — broadcast by ShoppingGateway to room
 * `family:{familyId}` only (BR-06). Payloads carry the same snapshots the REST API returns,
 * so the app can apply them without reloading; on reconnect it reloads over REST (NFR §9).
 * @uc UC-SHOP-01, UC-SHOP-02, UC-SHOP-03  @fr FR-06, FR-07, FR-08
 */
export const SHOPPING_REALTIME_EVENTS = {
  /** A list was created (FR-04, FR-06). */
  SHOPPING_LIST_CREATED: 'shopping:list-created',
  /** List date/period changed, or its status moved DRAFT → SHOPPING. */
  SHOPPING_LIST_UPDATED: 'shopping:list-updated',
  /** A list was deleted (only DRAFT/SHOPPING lists can be deleted). */
  SHOPPING_LIST_DELETED: 'shopping:list-deleted',
  /** An item was added to a list. */
  SHOPPING_ITEM_ADDED: 'shopping:item-added',
  /** An item was edited, (un)assigned, marked purchased or unmarked (FR-03, FR-07). */
  SHOPPING_ITEM_UPDATED: 'shopping:item-updated',
  /** An item was removed from a list. */
  SHOPPING_ITEM_REMOVED: 'shopping:item-removed',
  /** "Hoàn tất chuyến đi chợ": purchased items were imported into the fridge (FR-08, BR-02). */
  SHOPPING_TRIP_COMPLETED: 'shopping:trip-completed',
} as const;

/** One shopping list as returned by the REST API (without its items). */
export interface ShoppingListSnapshot {
  id: string;
  /** 'YYYY-MM-DD' — the shopping day (DAY) or the first day of the week (WEEK). */
  targetDate: string;
  periodType: PeriodType;
  status: ShoppingListStatus;
  createdBy: string | null;
  itemCount: number;
  purchasedCount: number;
  /** ISO timestamp. */
  updatedAt: string;
}

/** One item of a shopping list as returned by the REST API. */
export interface ShoppingItemSnapshot {
  id: string;
  shoppingListId: string;
  foodId: string | null;
  itemName: string;
  categoryId: string;
  categoryName: string | null;
  expectedQuantity: number;
  unitId: string;
  unitSymbol: string | null;
  status: ShoppingListItemStatus;
  isPurchased: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  purchasedBy: string | null;
  /** ISO timestamp or null. */
  purchasedAt: string | null;
  /** Optimistic lock version — send it back with every change (409 VERSION_CONFLICT if stale). */
  version: number;
}

/** What happened to an item in `shopping:item-updated`. */
export type ShoppingItemChange = 'edited' | 'assigned' | 'purchased' | 'unpurchased';

export interface ShoppingListChangedPayload {
  list: ShoppingListSnapshot;
  /** User who made the change. */
  actorId: string;
}

export interface ShoppingListDeletedPayload {
  listId: string;
  actorId: string;
}

export interface ShoppingItemAddedPayload {
  item: ShoppingItemSnapshot;
  actorId: string;
}

export interface ShoppingItemUpdatedPayload {
  item: ShoppingItemSnapshot;
  change: ShoppingItemChange;
  actorId: string;
}

export interface ShoppingItemRemovedPayload {
  listId: string;
  itemId: string;
  actorId: string;
}

export interface ShoppingTripCompletedPayload {
  list: ShoppingListSnapshot;
  /** Shopping items that were imported (only PURCHASED ones — BR-02). */
  importedItemIds: string[];
  /** Fridge lots that received the imported items. */
  fridgeItemIds: string[];
  /** Items still PENDING; they stay in the completed list as history. */
  pendingItemCount: number;
  actorId: string;
}

/** Event name → payload type for the shopping events. */
export interface ShoppingRealtimeEventPayloads {
  [SHOPPING_REALTIME_EVENTS.SHOPPING_LIST_CREATED]: ShoppingListChangedPayload;
  [SHOPPING_REALTIME_EVENTS.SHOPPING_LIST_UPDATED]: ShoppingListChangedPayload;
  [SHOPPING_REALTIME_EVENTS.SHOPPING_LIST_DELETED]: ShoppingListDeletedPayload;
  [SHOPPING_REALTIME_EVENTS.SHOPPING_ITEM_ADDED]: ShoppingItemAddedPayload;
  [SHOPPING_REALTIME_EVENTS.SHOPPING_ITEM_UPDATED]: ShoppingItemUpdatedPayload;
  [SHOPPING_REALTIME_EVENTS.SHOPPING_ITEM_REMOVED]: ShoppingItemRemovedPayload;
  [SHOPPING_REALTIME_EVENTS.SHOPPING_TRIP_COMPLETED]: ShoppingTripCompletedPayload;
}
