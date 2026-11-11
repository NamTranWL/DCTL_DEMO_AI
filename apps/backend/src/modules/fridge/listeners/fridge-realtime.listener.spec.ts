import { REALTIME_EVENTS } from '@dctl/shared';
import { type RealtimeService } from '../../../infrastructure/realtime/realtime.service';
import {
  FridgeItemsAddedEvent,
  FridgeItemsConsumedEvent,
  FridgeItemsDiscardedEvent,
  FridgeItemUpdatedEvent,
  type StockChange,
} from '../events';
import { FridgeRealtimeListener } from './fridge-realtime.listener';

const FAMILY = 'family-a';
const change: StockChange = {
  fridgeItemId: 'lot-1',
  foodId: 'f',
  quantity: 1,
  unitId: 'kg',
  remaining: 0,
};

function setup() {
  const realtime = { emitToFamily: jest.fn() };
  return { realtime, listener: new FridgeRealtimeListener(realtime as unknown as RealtimeService) };
}

describe('FridgeRealtimeListener (BR-06)', () => {
  it('broadcasts additions with their source', () => {
    const { realtime, listener } = setup();

    listener.onAdded(new FridgeItemsAddedEvent(FAMILY, ['lot-1'], 'shopping-trip', 'u1'));

    expect(realtime.emitToFamily).toHaveBeenCalledWith(
      FAMILY,
      REALTIME_EVENTS.FRIDGE_ITEMS_CHANGED,
      { reason: 'added', source: 'shopping-trip', fridgeItemIds: ['lot-1'], actorId: 'u1' },
    );
  });

  it.each([
    ['onConsumed', new FridgeItemsConsumedEvent(FAMILY, [change], 'u1'), 'consumed'],
    ['onDiscarded', new FridgeItemsDiscardedEvent(FAMILY, [change], 'u1'), 'discarded'],
    ['onUpdated', new FridgeItemUpdatedEvent(FAMILY, 'lot-1', 'u1'), 'updated'],
  ] as const)('%s → reason %s', (handler, event, reason) => {
    const { realtime, listener } = setup();

    (listener[handler] as (e: typeof event) => void).call(listener, event);

    expect(realtime.emitToFamily).toHaveBeenCalledWith(
      FAMILY,
      REALTIME_EVENTS.FRIDGE_ITEMS_CHANGED,
      { reason, fridgeItemIds: ['lot-1'], actorId: 'u1' },
    );
  });

  it('logs instead of throwing when the broadcast fails', () => {
    const { realtime, listener } = setup();
    realtime.emitToFamily.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() =>
      listener.onUpdated(new FridgeItemUpdatedEvent(FAMILY, 'lot-1', 'u1')),
    ).not.toThrow();
  });
});
