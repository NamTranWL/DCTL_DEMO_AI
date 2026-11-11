import {
  PeriodType,
  REALTIME_EVENTS,
  type ShoppingItemSnapshot,
  ShoppingListItemStatus,
  type ShoppingListSnapshot,
  ShoppingListStatus,
} from '@dctl/shared';
import { type RealtimeService } from '../../infrastructure/realtime/realtime.service';
import {
  ShoppingItemAddedEvent,
  ShoppingItemRemovedEvent,
  ShoppingItemUpdatedEvent,
  ShoppingListChangedEvent,
  ShoppingListDeletedEvent,
  ShoppingTripCompletedEvent,
} from './events';
import { ShoppingGateway } from './shopping.gateway';

const FAMILY = 'family-a';
const list: ShoppingListSnapshot = {
  id: 'list-1',
  targetDate: '2026-11-11',
  periodType: PeriodType.Day,
  status: ShoppingListStatus.Shopping,
  createdBy: 'u1',
  itemCount: 2,
  purchasedCount: 1,
  updatedAt: '2026-11-11T03:00:00.000Z',
};
const item: ShoppingItemSnapshot = {
  id: 'item-1',
  shoppingListId: 'list-1',
  foodId: null,
  itemName: 'Cà chua',
  categoryId: 'c',
  categoryName: 'Củ quả',
  expectedQuantity: 1,
  unitId: 'kg',
  unitSymbol: 'kg',
  status: ShoppingListItemStatus.Purchased,
  isPurchased: true,
  assigneeId: null,
  assigneeName: null,
  purchasedBy: 'u2',
  purchasedAt: '2026-11-11T03:00:00.000Z',
  version: 2,
};

function setup() {
  const realtime = { emitToFamily: jest.fn() };
  const gateway = new ShoppingGateway(realtime as unknown as RealtimeService);
  return { realtime, gateway };
}

describe('ShoppingGateway (FR-06, FR-07, BR-06)', () => {
  it.each([
    [
      'onListCreated',
      new ShoppingListChangedEvent(FAMILY, list, 'u1'),
      REALTIME_EVENTS.SHOPPING_LIST_CREATED,
      { list, actorId: 'u1' },
    ],
    [
      'onListUpdated',
      new ShoppingListChangedEvent(FAMILY, list, 'u2'),
      REALTIME_EVENTS.SHOPPING_LIST_UPDATED,
      { list, actorId: 'u2' },
    ],
    [
      'onListDeleted',
      new ShoppingListDeletedEvent(FAMILY, 'list-1', 'u1'),
      REALTIME_EVENTS.SHOPPING_LIST_DELETED,
      { listId: 'list-1', actorId: 'u1' },
    ],
    [
      'onItemAdded',
      new ShoppingItemAddedEvent(FAMILY, item, 'u1'),
      REALTIME_EVENTS.SHOPPING_ITEM_ADDED,
      { item, actorId: 'u1' },
    ],
    [
      'onItemUpdated',
      new ShoppingItemUpdatedEvent(FAMILY, item, 'purchased', 'u2', 'old'),
      REALTIME_EVENTS.SHOPPING_ITEM_UPDATED,
      { item, change: 'purchased', actorId: 'u2' },
    ],
    [
      'onItemRemoved',
      new ShoppingItemRemovedEvent(FAMILY, 'list-1', 'item-1', 'u1'),
      REALTIME_EVENTS.SHOPPING_ITEM_REMOVED,
      { listId: 'list-1', itemId: 'item-1', actorId: 'u1' },
    ],
    [
      'onTripCompleted',
      new ShoppingTripCompletedEvent(FAMILY, list, ['item-1'], ['lot-1'], 1, 'u2'),
      REALTIME_EVENTS.SHOPPING_TRIP_COMPLETED,
      {
        list,
        importedItemIds: ['item-1'],
        fridgeItemIds: ['lot-1'],
        pendingItemCount: 1,
        actorId: 'u2',
      },
    ],
  ] as const)('%s → %s to the family room only', (handler, event, name, payload) => {
    const { realtime, gateway } = setup();

    (gateway[handler] as (e: typeof event) => void).call(gateway, event);

    expect(realtime.emitToFamily).toHaveBeenCalledWith(FAMILY, name, payload);
  });

  it('never throws when the realtime layer fails (REST already committed)', () => {
    const { realtime, gateway } = setup();
    realtime.emitToFamily.mockImplementation(() => {
      throw new Error('redis down');
    });

    expect(() => gateway.onItemAdded(new ShoppingItemAddedEvent(FAMILY, item, 'u1'))).not.toThrow();
  });
});
