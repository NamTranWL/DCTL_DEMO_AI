import { type FridgeItemSource } from '@dctl/shared';

/**
 * Domain events of the fridge module (Observer pattern, §10). Emitted after the transaction
 * commits. Listeners: FridgeRealtimeListener (room `family:{id}`, B7); reports and expiry
 * reminders read inventory_transactions (B8, UC-RPT-01).
 */

export const FRIDGE_ITEMS_ADDED = 'fridge.items.added';
export const FRIDGE_ITEMS_CONSUMED = 'fridge.items.consumed';
export const FRIDGE_ITEMS_DISCARDED = 'fridge.items.discarded';
export const FRIDGE_ITEM_UPDATED = 'fridge.item.updated';

/** One change of stock on one lot, in the lot's own unit. */
export interface StockChange {
  fridgeItemId: string;
  foodId: string | null;
  quantity: number;
  unitId: string;
  /** Stock left on the lot after the change. */
  remaining: number;
}

/** Lots received stock: manual entry or "Hoàn tất chuyến đi chợ". @uc UC-FRIDGE-01  @br BR-02 */
export class FridgeItemsAddedEvent {
  constructor(
    readonly familyId: string,
    readonly fridgeItemIds: string[],
    readonly source: FridgeItemSource,
    readonly actorId: string,
  ) {}
}

/** Stock was used (CONSUME, FEFO). @uc UC-FRIDGE-03  @fr FR-13  @br BR-03 */
export class FridgeItemsConsumedEvent {
  constructor(
    readonly familyId: string,
    readonly changes: StockChange[],
    readonly actorId: string,
  ) {}
}

/** Stock was thrown away (DISCARD — waste, FR-23). @uc UC-FRIDGE-03  @br BR-05 */
export class FridgeItemsDiscardedEvent {
  constructor(
    readonly familyId: string,
    readonly changes: StockChange[],
    readonly actorId: string,
  ) {}
}

/** Expiry date / storage location / price of a lot was edited. @uc UC-FRIDGE-01  @br BR-02 */
export class FridgeItemUpdatedEvent {
  constructor(
    readonly familyId: string,
    readonly fridgeItemId: string,
    readonly actorId: string,
  ) {}
}
