import { FridgeItemState, InventoryTransactionType } from '@dctl/shared';
import {
  InsufficientStockException,
  InvalidQuantityException,
} from '../../../common/exceptions/domain.exceptions';
import { addDays } from '../../../common/utils/date.util';
import { FridgeItem } from './fridge-item.entity';

const TODAY = '2026-11-05';

function itemExpiringIn(days: number, quantity = 1): FridgeItem {
  const item = new FridgeItem();
  item.quantity = quantity;
  item.expiryDate = addDays(TODAY, days);
  return item;
}

describe('FridgeItem.getState — BR-01 boundary table (§13)', () => {
  it.each([
    [5, FridgeItemState.Fresh],
    [4, FridgeItemState.Fresh],
    [3, FridgeItemState.ExpiringSoon],
    [1, FridgeItemState.ExpiringSoon],
    [0, FridgeItemState.Expired],
    [-1, FridgeItemState.Expired],
  ])('%i day(s) left → %s', (days, expected) => {
    expect(itemExpiringIn(days).getState(TODAY)).toBe(expected);
  });

  it('is CONSUMED when stock is 0 and the last transaction was CONSUME', () => {
    const item = itemExpiringIn(2, 0);

    expect(item.getState(TODAY, InventoryTransactionType.Consume)).toBe(FridgeItemState.Consumed);
  });

  it('is DISCARDED when stock is 0 and the last transaction was DISCARD (BR-05)', () => {
    const item = itemExpiringIn(-3, 0);

    expect(item.getState(TODAY, InventoryTransactionType.Discard)).toBe(FridgeItemState.Discarded);
  });
});

describe('FridgeItem.decrease — BR-03 (stock never negative)', () => {
  it('subtracts the requested amount', () => {
    const item = itemExpiringIn(5, 2);

    expect(item.decrease(0.5)).toBe(0.5);
    expect(item.quantity).toBe(1.5);
  });

  it('allows using up the whole stock (boundary: amount = quantity)', () => {
    const item = itemExpiringIn(5, 2);
    item.decrease(2);

    expect(item.quantity).toBe(0);
    expect(item.isInStock()).toBe(false);
  });

  it('rejects more than available (boundary: quantity + 0.001)', () => {
    expect(() => itemExpiringIn(5, 2).decrease(2.001)).toThrow(InsufficientStockException);
  });

  it.each([0, -1, Number.NaN])('rejects a non-positive amount %p', (amount) => {
    expect(() => itemExpiringIn(5, 2).decrease(amount)).toThrow(InvalidQuantityException);
  });

  it('avoids floating point drift (0.3 − 0.1)', () => {
    const item = itemExpiringIn(5, 0.3);
    item.decrease(0.1);

    expect(item.quantity).toBe(0.2);
  });
});

describe('FridgeItem.increase', () => {
  it('adds stock and rejects non-positive amounts', () => {
    const item = itemExpiringIn(5, 1);
    item.increase(2);

    expect(item.quantity).toBe(3);
    expect(() => item.increase(0)).toThrow(InvalidQuantityException);
  });
});
