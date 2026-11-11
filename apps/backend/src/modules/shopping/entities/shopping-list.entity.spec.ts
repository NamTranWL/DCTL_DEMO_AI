import { ShoppingListItemStatus, ShoppingListStatus } from '@dctl/shared';
import { InvalidStateTransitionException } from '../../../common/exceptions/domain.exceptions';
import { ShoppingListItem } from './shopping-list-item.entity';
import { ShoppingList } from './shopping-list.entity';

function listIn(status: ShoppingListStatus): ShoppingList {
  const list = new ShoppingList();
  list.status = status;
  return list;
}

describe('ShoppingList state machine (DRAFT → SHOPPING → COMPLETED)', () => {
  it('starts shopping from DRAFT', () => {
    const list = listIn(ShoppingListStatus.Draft);
    list.startShopping();

    expect(list.status).toBe(ShoppingListStatus.Shopping);
  });

  it('completes from SHOPPING and is no longer editable', () => {
    const list = listIn(ShoppingListStatus.Shopping);
    list.complete();

    expect(list.status).toBe(ShoppingListStatus.Completed);
    expect(list.isEditable()).toBe(false);
  });

  it.each([
    ['complete', ShoppingListStatus.Draft],
    ['startShopping', ShoppingListStatus.Shopping],
    ['startShopping', ShoppingListStatus.Completed],
    ['complete', ShoppingListStatus.Completed],
  ] as const)('rejects %s() from %s', (method, status) => {
    const list = listIn(status);

    expect(() => list[method]()).toThrow(InvalidStateTransitionException);
    expect(list.status).toBe(status);
  });
});

describe('ShoppingList.assertEditable / ensureShopping', () => {
  it('ensureShopping moves DRAFT → SHOPPING once and reports it', () => {
    const list = listIn(ShoppingListStatus.Draft);

    expect(list.ensureShopping()).toBe(true);
    expect(list.status).toBe(ShoppingListStatus.Shopping);
    expect(list.ensureShopping()).toBe(false);
  });

  it('a completed list cannot change anymore', () => {
    expect(() => listIn(ShoppingListStatus.Shopping).assertEditable('ADD_ITEM')).not.toThrow();
    expect(() => listIn(ShoppingListStatus.Completed).assertEditable('ADD_ITEM')).toThrow(
      InvalidStateTransitionException,
    );
  });
});

describe('ShoppingListItem (PENDING ⇄ PURCHASED)', () => {
  function pendingItem(): ShoppingListItem {
    const item = new ShoppingListItem();
    item.isPurchased = false;
    item.assigneeId = null;
    item.purchasedBy = null;
    item.purchasedAt = null;
    return item;
  }

  it('derives status from is_purchased', () => {
    expect(pendingItem().status).toBe(ShoppingListItemStatus.Pending);
  });

  it('markAsPurchased records who and when', () => {
    const item = pendingItem();
    const at = new Date('2026-11-05T10:00:00Z');
    item.markAsPurchased('user-1', at);

    expect(item.status).toBe(ShoppingListItemStatus.Purchased);
    expect(item.purchasedBy).toBe('user-1');
    expect(item.purchasedAt).toBe(at);
  });

  it('rejects marking an already purchased item twice', () => {
    const item = pendingItem();
    item.markAsPurchased('user-1');

    expect(() => item.markAsPurchased('user-2')).toThrow(InvalidStateTransitionException);
    expect(item.purchasedBy).toBe('user-1');
  });

  it('assigns and unassigns a member while pending (FR-03)', () => {
    const item = pendingItem();
    item.assignTo('user-2');
    expect(item.assigneeId).toBe('user-2');

    item.assignTo(null);
    expect(item.assigneeId).toBeNull();
  });

  it('cannot be reassigned after purchase', () => {
    const item = pendingItem();
    item.markAsPurchased('user-1');

    expect(() => item.assignTo('user-2')).toThrow(InvalidStateTransitionException);
  });

  it('unmarkPurchased goes back to PENDING and clears who/when (B7)', () => {
    const item = pendingItem();
    item.markAsPurchased('user-1');
    item.unmarkPurchased();

    expect(item.status).toBe(ShoppingListItemStatus.Pending);
    expect(item.purchasedBy).toBeNull();
    expect(item.purchasedAt).toBeNull();
    expect(() => item.unmarkPurchased()).toThrow(InvalidStateTransitionException);
  });

  it('edit changes only the given fields of a pending item', () => {
    const item = Object.assign(pendingItem(), {
      foodId: 'food-1',
      itemName: 'Cà chua',
      categoryId: 'cat-1',
      expectedQuantity: 1,
      unitId: 'kg',
    });
    item.edit({ expectedQuantity: 2 });
    expect(item).toMatchObject({ foodId: 'food-1', itemName: 'Cà chua', expectedQuantity: 2 });

    item.edit({ foodId: null, itemName: 'Cà chua bi', categoryId: 'cat-2', unitId: 'g' });
    expect(item).toMatchObject({
      foodId: null,
      itemName: 'Cà chua bi',
      categoryId: 'cat-2',
      unitId: 'g',
    });

    item.markAsPurchased('user-1');
    expect(() => item.edit({ expectedQuantity: 3 })).toThrow(InvalidStateTransitionException);
  });
});
