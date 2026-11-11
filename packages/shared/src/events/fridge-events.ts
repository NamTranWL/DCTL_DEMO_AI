/**
 * Realtime events of the fridge module (B7) — broadcast to room `family:{familyId}` only
 * (BR-06). Fridge screens are filtered/paged, so the payload carries ids only: the app reloads
 * the affected lots (or its current page) over REST.
 * @uc UC-FRIDGE-01, UC-FRIDGE-02, UC-FRIDGE-03  @fr FR-09, FR-12, FR-13
 */
export const FRIDGE_REALTIME_EVENTS = {
  /** Lots were added, consumed, discarded or edited. */
  FRIDGE_ITEMS_CHANGED: 'fridge:items-changed',
} as const;

export type FridgeChangeReason = 'added' | 'consumed' | 'discarded' | 'updated';

/** Where added stock came from. */
export type FridgeItemSource = 'manual' | 'shopping-trip';

export interface FridgeItemsChangedPayload {
  reason: FridgeChangeReason;
  /** Only set when reason = 'added'. */
  source?: FridgeItemSource;
  fridgeItemIds: string[];
  /** User who made the change. */
  actorId: string;
}

/** Event name → payload type for the fridge events. */
export interface FridgeRealtimeEventPayloads {
  [FRIDGE_REALTIME_EVENTS.FRIDGE_ITEMS_CHANGED]: FridgeItemsChangedPayload;
}
