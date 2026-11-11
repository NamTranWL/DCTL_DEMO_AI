import {
  PeriodType,
  ShoppingListItemStatus,
  ShoppingListStatus,
  StorageLocation,
} from '@dctl/shared';
import { type EventEmitter2 } from '@nestjs/event-emitter';
import { type DataSource, type EntityManager } from 'typeorm';
import { type BusinessClock } from '../../common/clock/business-clock';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { addDays } from '../../common/utils/date.util';
import { FridgeItemsAddedEvent } from '../fridge/events';
import { type FridgeService } from '../fridge/fridge.service';
import { type FridgeItemInput } from '../fridge/fridge.types';
import {
  type CatalogItemInput,
  type CatalogItemResolver,
  type ResolvedCatalogItem,
} from '../master-data/catalog-item.resolver';
import { Category } from '../master-data/entities/category.entity';
import { Unit } from '../master-data/entities/unit.entity';
import { type UserRepository } from '../users/repositories/user.repository';
import { ShoppingListItem } from './entities/shopping-list-item.entity';
import { ShoppingList } from './entities/shopping-list.entity';
import {
  SHOPPING_ITEM_ADDED,
  SHOPPING_ITEM_REMOVED,
  SHOPPING_ITEM_UPDATED,
  SHOPPING_LIST_CREATED,
  SHOPPING_LIST_DELETED,
  SHOPPING_LIST_UPDATED,
  SHOPPING_TRIP_COMPLETED,
  type ShoppingItemUpdatedEvent,
  type ShoppingTripCompletedEvent,
} from './events';
import { type ShoppingListItemRepository } from './repositories/shopping-list-item.repository';
import { type ShoppingListRepository } from './repositories/shopping-list.repository';
import { ShoppingService } from './shopping.service';

const TODAY = '2026-11-11';
const FAMILY = 'family-a';
const OTHER_FAMILY = 'family-b';
const HOMEMAKER = 'user-homemaker';
const MEMBER = 'user-member';

const VEG = Object.assign(new Category(), { id: 'cat-veg', name: 'Củ quả' });
const KG = Object.assign(new Unit(), { id: 'kg', symbol: 'kg' });

/** In-memory stand-in for the two repositories (simulates @VersionColumn and FK lookups). */
function createStore() {
  const lists = new Map<string, ShoppingList>();
  const items = new Map<string, ShoppingListItem>();
  let seq = 0;
  const stamp = <T extends { id: string; createdAt: Date; updatedAt: Date }>(e: T): T => {
    if (!e.id) {
      seq++;
      e.id = `id-${seq}`;
      e.createdAt = new Date(Date.UTC(2026, 10, 11, 0, 0, seq));
    }
    e.updatedAt = new Date(Date.UTC(2026, 10, 11, 1, 0, seq++));
    return e;
  };

  const listRepo = {
    withManager: jest.fn(),
    findInFamily: jest.fn((id: string, familyId: string) =>
      Promise.resolve(lists.get(id)?.familyId === familyId ? (lists.get(id) ?? null) : null),
    ),
    lockInFamily: jest.fn((id: string, familyId: string) =>
      Promise.resolve(lists.get(id)?.familyId === familyId ? (lists.get(id) ?? null) : null),
    ),
    listForFamily: jest.fn(),
    create: jest.fn((fields: Partial<ShoppingList>) => Object.assign(new ShoppingList(), fields)),
    save: jest.fn((list: ShoppingList) => {
      lists.set(stamp(list).id, list);
      return Promise.resolve(list);
    }),
    delete: jest.fn(({ id }: { id: string }) => {
      lists.delete(id);
      for (const [key, item] of items) {
        if (item.shoppingListId === id) {
          items.delete(key);
        }
      }
      return Promise.resolve();
    }),
  };
  listRepo.withManager.mockReturnValue(listRepo);

  const withRelations = (item: ShoppingListItem): ShoppingListItem =>
    Object.assign(new ShoppingListItem(), item, {
      category: VEG,
      unit: KG,
      assignee: item.assigneeId ? { username: `name-of-${item.assigneeId}` } : null,
    });

  const itemRepo = {
    withManager: jest.fn(),
    findByList: jest.fn((listId: string) =>
      Promise.resolve(
        [...items.values()].filter((i) => i.shoppingListId === listId).map(withRelations),
      ),
    ),
    findWithRelations: jest.fn((id: string) => {
      const item = items.get(id);
      return Promise.resolve(item ? withRelations(item) : null);
    }),
    lockInList: jest.fn((id: string, listId: string) => {
      const item = items.get(id);
      return Promise.resolve(item?.shoppingListId === listId ? item : null);
    }),
    findPurchased: jest.fn((listId: string) =>
      Promise.resolve(
        [...items.values()].filter((i) => i.shoppingListId === listId && i.isPurchased),
      ),
    ),
    countByLists: jest.fn((ids: string[]) => {
      const counts = new Map<string, { total: number; purchased: number }>();
      for (const id of ids) {
        const own = [...items.values()].filter((i) => i.shoppingListId === id);
        counts.set(id, { total: own.length, purchased: own.filter((i) => i.isPurchased).length });
      }
      return Promise.resolve(counts);
    }),
    countBy: jest.fn(({ shoppingListId, isPurchased }: Partial<ShoppingListItem>) =>
      Promise.resolve(
        [...items.values()].filter(
          (i) => i.shoppingListId === shoppingListId && i.isPurchased === isPurchased,
        ).length,
      ),
    ),
    create: jest.fn((fields: Partial<ShoppingListItem>) =>
      Object.assign(new ShoppingListItem(), {
        isPurchased: false,
        purchasedBy: null,
        purchasedAt: null,
        assigneeId: null,
        ...fields,
      }),
    ),
    save: jest.fn((entity: ShoppingListItem | ShoppingListItem[]) => {
      for (const item of Array.isArray(entity) ? entity : [entity]) {
        const isNew = !item.id;
        stamp(item);
        item.version = isNew ? 1 : item.version + 1;
        items.set(item.id, item);
      }
      return Promise.resolve(entity);
    }),
    delete: jest.fn(({ id }: { id: string }) => {
      items.delete(id);
      return Promise.resolve();
    }),
  };
  itemRepo.withManager.mockReturnValue(itemRepo);

  return { lists, items, listRepo, itemRepo };
}

function setup() {
  const store = createStore();
  const manager = {} as EntityManager;
  const dataSource = {
    transaction: jest.fn((run: (m: EntityManager) => Promise<unknown>) => run(manager)),
  };
  const users = {
    findBy: jest.fn(() => Promise.resolve([{ id: HOMEMAKER }, { id: MEMBER }])),
  };
  const catalog = {
    resolve: jest.fn((_familyId: string, inputs: CatalogItemInput[]) =>
      Promise.resolve(
        inputs.map((i): ResolvedCatalogItem => ({
          foodId: i.foodId ?? null,
          name: i.name ?? (i.foodId ? `food:${i.foodId}` : ''),
          categoryId: i.categoryId ?? VEG.id,
          unitId: i.unitId,
          category: VEG,
          unit: KG,
        })),
      ),
    ),
  };
  const fridgeService = {
    addItems: jest.fn((inputs: FridgeItemInput[]) =>
      Promise.resolve({
        lots: inputs.map((_, index) => ({ id: `lot-${index}` })),
        event: new FridgeItemsAddedEvent(
          FAMILY,
          inputs.map((_, index) => `lot-${index}`),
          'shopping-trip',
          MEMBER,
        ),
      }),
    ),
    publishItemsAdded: jest.fn(),
  };
  const clock = { today: () => TODAY, now: () => new Date('2026-11-11T03:00:00Z') };
  const events = { emit: jest.fn() };

  const service = new ShoppingService(
    dataSource as unknown as DataSource,
    store.listRepo as unknown as ShoppingListRepository,
    store.itemRepo as unknown as ShoppingListItemRepository,
    users as unknown as UserRepository,
    catalog as unknown as CatalogItemResolver,
    fridgeService as unknown as FridgeService,
    clock as unknown as BusinessClock,
    events as unknown as EventEmitter2,
  );
  const emitted = (name: string): unknown[] =>
    (events.emit.mock.calls as unknown as [string, unknown][])
      .filter(([event]) => event === name)
      .map(([, payload]) => payload);
  return { service, store, manager, dataSource, users, catalog, fridgeService, events, emitted };
}

type Ctx = ReturnType<typeof setup>;

async function createListWith(ctx: Ctx, names: string[]) {
  return ctx.service.createList(FAMILY, HOMEMAKER, {
    targetDate: TODAY,
    items: names.map((name) => ({
      itemName: name,
      categoryId: VEG.id,
      expectedQuantity: 1,
      unitId: KG.id,
    })),
  });
}

async function purchase(ctx: Ctx, listId: string, itemId: string, actor = MEMBER) {
  const version = ctx.store.items.get(itemId)?.version ?? 0;
  return ctx.service.markAsPurchased(FAMILY, actor, listId, itemId, { version });
}

describe('ShoppingService.createList (UC-SHOP-01, FR-04)', () => {
  it('saves a DRAFT list with its items and shares it (SHOPPING_LIST_CREATED)', async () => {
    const ctx = setup();

    const detail = await ctx.service.createList(FAMILY, HOMEMAKER, {
      targetDate: TODAY,
      periodType: PeriodType.Week,
      items: [
        { foodId: 'food-tomato', expectedQuantity: 2, unitId: KG.id, assigneeId: MEMBER },
        { itemName: 'Bánh mì', categoryId: VEG.id, expectedQuantity: 1, unitId: KG.id },
      ],
    });

    expect(detail).toMatchObject({
      status: ShoppingListStatus.Draft,
      periodType: PeriodType.Week,
      createdBy: HOMEMAKER,
      itemCount: 2,
      purchasedCount: 0,
    });
    expect(detail.items).toEqual([
      expect.objectContaining({
        foodId: 'food-tomato',
        expectedQuantity: 2,
        assigneeId: MEMBER,
        assigneeName: `name-of-${MEMBER}`,
        status: ShoppingListItemStatus.Pending,
        version: 1,
      }),
      expect.objectContaining({ foodId: null, itemName: 'Bánh mì', categoryName: 'Củ quả' }),
    ]);
    expect(ctx.users.findBy).toHaveBeenCalledTimes(1);
    const [event] = ctx.emitted(SHOPPING_LIST_CREATED);
    expect(event).toMatchObject({ familyId: FAMILY, actorId: HOMEMAKER, list: { itemCount: 2 } });
    expect(event).not.toHaveProperty('list.items');
  });

  it('defaults to a DAY list and accepts an empty list', async () => {
    const ctx = setup();

    const detail = await ctx.service.createList(FAMILY, HOMEMAKER, { targetDate: TODAY });

    expect(detail).toMatchObject({ periodType: PeriodType.Day, itemCount: 0, items: [] });
    expect(ctx.users.findBy).not.toHaveBeenCalled();
  });

  it.each([
    [PeriodType.Day, -1, false],
    [PeriodType.Day, 0, true],
    [PeriodType.Week, -6, true],
    [PeriodType.Week, -7, false],
  ])('%s list starting %i day(s) from today accepted = %s (BVA)', async (period, offset, ok) => {
    const ctx = setup();
    const run = ctx.service.createList(FAMILY, HOMEMAKER, {
      targetDate: addDays(TODAY, offset),
      periodType: period,
    });

    if (ok) {
      await expect(run).resolves.toBeDefined();
    } else {
      await expect(run).rejects.toMatchObject({
        code: ErrorCode.ValidationError,
        details: [expect.objectContaining({ field: 'targetDate' })],
      });
    }
  });

  it('rejects an assignee outside the family (BR-06)', async () => {
    const ctx = setup();
    ctx.users.findBy.mockResolvedValueOnce([]);

    await expect(
      ctx.service.createList(FAMILY, HOMEMAKER, {
        targetDate: TODAY,
        items: [{ itemName: 'Gạo', expectedQuantity: 1, unitId: KG.id, assigneeId: 'stranger' }],
      }),
    ).rejects.toMatchObject({ code: ErrorCode.MemberNotFound, details: { userIds: ['stranger'] } });
  });
});

describe('ShoppingService — xem, sửa, xoá danh sách', () => {
  it('lists the family lists with item counts (paged)', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A', 'B']);
    await purchase(ctx, detail.id, detail.items[0]?.id ?? '');
    ctx.store.listRepo.listForFamily.mockResolvedValue([[ctx.store.lists.get(detail.id)], 1]);

    const page = await ctx.service.listLists(FAMILY, { page: 1, pageSize: 20, offset: 0 });

    expect(page.meta).toEqual({ total: 1, page: 1, pageSize: 20 });
    expect(page.items).toEqual([
      expect.objectContaining({ id: detail.id, itemCount: 2, purchasedCount: 1 }),
    ]);
  });

  it('404 for a list of another family (BR-06)', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);

    await expect(ctx.service.getList(OTHER_FAMILY, detail.id)).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });
    await expect(ctx.service.deleteList(OTHER_FAMILY, HOMEMAKER, detail.id)).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });
  });

  it('updates date/period and emits SHOPPING_LIST_UPDATED; past date → 400', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, []);

    const updated = await ctx.service.updateList(FAMILY, HOMEMAKER, detail.id, {
      targetDate: addDays(TODAY, 2),
    });

    expect(updated.targetDate).toBe(addDays(TODAY, 2));
    expect(ctx.emitted(SHOPPING_LIST_UPDATED)).toHaveLength(1);
    await expect(
      ctx.service.updateList(FAMILY, HOMEMAKER, detail.id, { targetDate: addDays(TODAY, -1) }),
    ).rejects.toMatchObject({ code: ErrorCode.ValidationError });
    // Nothing to validate when nothing changes.
    await expect(ctx.service.updateList(FAMILY, HOMEMAKER, detail.id, {})).resolves.toBeDefined();
  });

  it('deletes a draft list (SHOPPING_LIST_DELETED) but never a completed one', async () => {
    const ctx = setup();
    const draft = await createListWith(ctx, ['A']);
    await ctx.service.deleteList(FAMILY, HOMEMAKER, draft.id);
    expect(ctx.store.lists.has(draft.id)).toBe(false);
    expect(ctx.emitted(SHOPPING_LIST_DELETED)).toEqual([
      expect.objectContaining({ listId: draft.id }),
    ]);

    const done = await createListWith(ctx, ['B']);
    await purchase(ctx, done.id, done.items[0]?.id ?? '');
    await ctx.service.completeTrip(FAMILY, MEMBER, done.id, {});
    await expect(ctx.service.deleteList(FAMILY, HOMEMAKER, done.id)).rejects.toMatchObject({
      code: ErrorCode.InvalidStateTransition,
    });
    await expect(
      ctx.service.updateList(FAMILY, HOMEMAKER, done.id, { periodType: PeriodType.Week }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidStateTransition });
  });
});

describe('ShoppingService — mặt hàng (UC-SHOP-01, FR-03, FR-05)', () => {
  it('adds an item and emits SHOPPING_ITEM_ADDED', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, []);

    const item = await ctx.service.addItem(FAMILY, HOMEMAKER, detail.id, {
      foodId: 'food-pork',
      expectedQuantity: 0.5,
      unitId: KG.id,
      assigneeId: MEMBER,
    });

    expect(item).toMatchObject({ foodId: 'food-pork', assigneeId: MEMBER, version: 1 });
    expect(ctx.emitted(SHOPPING_ITEM_ADDED)).toEqual([expect.objectContaining({ item })]);
  });

  it('edits a pending item: quantity only keeps the food; new free name drops the food', async () => {
    const ctx = setup();
    const detail = await ctx.service.createList(FAMILY, HOMEMAKER, {
      targetDate: TODAY,
      items: [{ foodId: 'food-tomato', expectedQuantity: 1, unitId: KG.id }],
    });
    const itemId = detail.items[0]?.id ?? '';

    const qty = await ctx.service.updateItem(FAMILY, HOMEMAKER, detail.id, itemId, {
      version: 1,
      expectedQuantity: 3,
    });
    expect(qty).toMatchObject({ foodId: 'food-tomato', expectedQuantity: 3, version: 2 });

    const renamed = await ctx.service.updateItem(FAMILY, HOMEMAKER, detail.id, itemId, {
      version: 2,
      itemName: 'Cà chua bi',
    });
    expect(ctx.catalog.resolve).toHaveBeenLastCalledWith(FAMILY, [
      { foodId: null, name: 'Cà chua bi', categoryId: VEG.id, unitId: KG.id },
    ]);
    expect(renamed).toMatchObject({ foodId: null, itemName: 'Cà chua bi', version: 3 });

    await ctx.service.updateItem(FAMILY, HOMEMAKER, detail.id, itemId, {
      version: 3,
      foodId: 'food-cherry',
    });
    expect(ctx.catalog.resolve).toHaveBeenLastCalledWith(FAMILY, [
      { foodId: 'food-cherry', name: null, categoryId: null, unitId: KG.id },
    ]);
    const edits = ctx.emitted(SHOPPING_ITEM_UPDATED) as ShoppingItemUpdatedEvent[];
    expect(edits.map((e) => e.change)).toEqual(['edited', 'edited', 'edited']);
  });

  it('changing only the category/unit keeps the food and name', async () => {
    const ctx = setup();
    const detail = await ctx.service.createList(FAMILY, HOMEMAKER, {
      targetDate: TODAY,
      items: [{ foodId: 'food-tomato', expectedQuantity: 1, unitId: KG.id }],
    });

    await ctx.service.updateItem(FAMILY, HOMEMAKER, detail.id, detail.items[0]?.id ?? '', {
      version: 1,
      unitId: 'g',
    });

    expect(ctx.catalog.resolve).toHaveBeenLastCalledWith(FAMILY, [
      { foodId: 'food-tomato', name: 'food:food-tomato', categoryId: VEG.id, unitId: 'g' },
    ]);
  });

  it('stale version → 409 VERSION_CONFLICT with the current item (NFR §9)', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);
    const itemId = detail.items[0]?.id ?? '';
    await ctx.service.updateItem(FAMILY, HOMEMAKER, detail.id, itemId, {
      version: 1,
      expectedQuantity: 2,
    });

    await expect(
      ctx.service.updateItem(FAMILY, HOMEMAKER, detail.id, itemId, {
        version: 1,
        expectedQuantity: 5,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.VersionConflict,
      details: {
        expectedVersion: 1,
        currentVersion: 2,
        current: expect.objectContaining({ id: itemId, expectedQuantity: 2 }) as unknown,
      },
    });
    expect(ctx.store.items.get(itemId)?.expectedQuantity).toBe(2);
  });

  it('removes a pending item; a purchased one must be unmarked first', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A', 'B']);
    const [a, b] = detail.items;

    await ctx.service.removeItem(FAMILY, HOMEMAKER, detail.id, a?.id ?? '');
    expect(ctx.store.items.has(a?.id ?? '')).toBe(false);
    expect(ctx.emitted(SHOPPING_ITEM_REMOVED)).toHaveLength(1);

    await purchase(ctx, detail.id, b?.id ?? '');
    await expect(
      ctx.service.removeItem(FAMILY, HOMEMAKER, detail.id, b?.id ?? ''),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidStateTransition });
    await expect(
      ctx.service.removeItem(FAMILY, HOMEMAKER, detail.id, 'missing'),
    ).rejects.toMatchObject({ code: ErrorCode.NotFound });
  });

  it('assigns and unassigns; reports the previous assignee for notifications', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);
    const itemId = detail.items[0]?.id ?? '';

    const assigned = await ctx.service.assignItem(FAMILY, HOMEMAKER, detail.id, itemId, {
      version: 1,
      assigneeId: MEMBER,
    });
    expect(assigned).toMatchObject({ assigneeId: MEMBER, version: 2 });
    const cleared = await ctx.service.assignItem(FAMILY, HOMEMAKER, detail.id, itemId, {
      version: 2,
      assigneeId: null,
    });
    expect(cleared.assigneeId).toBeNull();
    expect(ctx.users.findBy).toHaveBeenCalledTimes(1);

    const events = ctx.emitted(SHOPPING_ITEM_UPDATED) as ShoppingItemUpdatedEvent[];
    expect(events.map((e) => [e.change, e.previousAssigneeId])).toEqual([
      ['assigned', null],
      ['assigned', MEMBER],
    ]);
  });

  it('cannot edit or assign a purchased item', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);
    const itemId = detail.items[0]?.id ?? '';
    await purchase(ctx, detail.id, itemId);

    await expect(
      ctx.service.updateItem(FAMILY, HOMEMAKER, detail.id, itemId, {
        version: 2,
        expectedQuantity: 9,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidStateTransition });
    await expect(
      ctx.service.assignItem(FAMILY, HOMEMAKER, detail.id, itemId, {
        version: 2,
        assigneeId: MEMBER,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidStateTransition });
  });
});

describe('ShoppingService — đánh dấu đã mua (UC-SHOP-03, FR-07)', () => {
  it('first purchase moves the list DRAFT → SHOPPING and emits list + item updates', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A', 'B']);
    const [a, b] = detail.items;

    const item = await purchase(ctx, detail.id, a?.id ?? '');
    expect(item).toMatchObject({
      status: ShoppingListItemStatus.Purchased,
      purchasedBy: MEMBER,
      purchasedAt: '2026-11-11T03:00:00.000Z',
      version: 2,
    });
    expect(ctx.store.lists.get(detail.id)?.status).toBe(ShoppingListStatus.Shopping);
    expect(ctx.emitted(SHOPPING_LIST_UPDATED)).toEqual([
      expect.objectContaining({
        list: expect.objectContaining({ purchasedCount: 1 }) as unknown,
      }),
    ]);

    await purchase(ctx, detail.id, b?.id ?? '');
    // Second purchase: list already SHOPPING → no further list event.
    expect(ctx.emitted(SHOPPING_LIST_UPDATED)).toHaveLength(1);
    const changes = (ctx.emitted(SHOPPING_ITEM_UPDATED) as ShoppingItemUpdatedEvent[]).map(
      (e) => e.change,
    );
    expect(changes).toEqual(['purchased', 'purchased']);
  });

  it('purchasing twice → 409; unmark goes back to PENDING (list stays SHOPPING)', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);
    const itemId = detail.items[0]?.id ?? '';
    await purchase(ctx, detail.id, itemId);

    await expect(purchase(ctx, detail.id, itemId)).rejects.toMatchObject({
      code: ErrorCode.InvalidStateTransition,
    });
    const undone = await ctx.service.unmarkPurchased(FAMILY, MEMBER, detail.id, itemId, {
      version: 2,
    });
    expect(undone).toMatchObject({
      status: ShoppingListItemStatus.Pending,
      purchasedBy: null,
      purchasedAt: null,
    });
    expect(ctx.store.lists.get(detail.id)?.status).toBe(ShoppingListStatus.Shopping);
    await expect(
      ctx.service.unmarkPurchased(FAMILY, MEMBER, detail.id, itemId, { version: 3 }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidStateTransition });
  });

  it('item of another list → 404', async () => {
    const ctx = setup();
    const one = await createListWith(ctx, ['A']);
    const two = await createListWith(ctx, ['B']);

    await expect(purchase(ctx, two.id, one.items[0]?.id ?? '')).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });
  });
});

describe('ShoppingService.completeTrip (UC-SHOP-03, FR-08, BR-02)', () => {
  it('imports ONLY purchased items in the same transaction, then completes the list', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A', 'B', 'C']);
    const [a, b, c] = detail.items;
    await purchase(ctx, detail.id, a?.id ?? '');
    await purchase(ctx, detail.id, b?.id ?? '');

    const result = await ctx.service.completeTrip(FAMILY, MEMBER, detail.id, {
      items: [
        {
          itemId: b?.id ?? '',
          quantity: 1.5,
          expiryDate: addDays(TODAY, 4),
          storageLocation: StorageLocation.Freezer,
          purchasedPrice: 20000,
        },
      ],
    });

    const [inputs, context] = (ctx.fridgeService.addItems.mock.calls[0] ?? []) as unknown as [
      FridgeItemInput[],
      Record<string, unknown>,
    ];
    expect(inputs).toEqual([
      expect.objectContaining({ name: 'A', quantity: 1, expiryDate: null, purchasedPrice: null }),
      expect.objectContaining({
        name: 'B',
        quantity: 1.5,
        expiryDate: addDays(TODAY, 4),
        storageLocation: StorageLocation.Freezer,
        purchasedPrice: 20000,
      }),
    ]);
    expect(context).toMatchObject({
      familyId: FAMILY,
      actorId: MEMBER,
      source: 'shopping-trip',
      manager: ctx.manager,
    });
    expect(ctx.dataSource.transaction).toHaveBeenCalled();
    expect(result).toMatchObject({
      list: { status: ShoppingListStatus.Completed },
      importedItemIds: [a?.id, b?.id],
      fridgeItemIds: ['lot-0', 'lot-1'],
      pendingItemCount: 1,
    });
    expect(ctx.store.items.get(c?.id ?? '')?.isPurchased).toBe(false);
    expect(ctx.fridgeService.publishItemsAdded).toHaveBeenCalledTimes(1);
    const [event] = ctx.emitted(SHOPPING_TRIP_COMPLETED) as ShoppingTripCompletedEvent[];
    expect(event).toMatchObject({ actorId: MEMBER, pendingItemCount: 1 });
  });

  it('nothing purchased → 409 SHOPPING_NOTHING_PURCHASED, fridge untouched', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);

    await expect(ctx.service.completeTrip(FAMILY, MEMBER, detail.id, {})).rejects.toMatchObject({
      code: ErrorCode.NothingPurchased,
    });
    expect(ctx.fridgeService.addItems).not.toHaveBeenCalled();
    expect(ctx.store.lists.get(detail.id)?.status).toBe(ShoppingListStatus.Draft);
  });

  it('override for an item that is not purchased → 400; past expiry → 400', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A', 'B']);
    const [a, b] = detail.items;
    await purchase(ctx, detail.id, a?.id ?? '');

    await expect(
      ctx.service.completeTrip(FAMILY, MEMBER, detail.id, { items: [{ itemId: b?.id ?? '' }] }),
    ).rejects.toMatchObject({
      code: ErrorCode.ValidationError,
      details: [expect.objectContaining({ field: 'items.0.itemId' })],
    });
    await expect(
      ctx.service.completeTrip(FAMILY, MEMBER, detail.id, {
        items: [{ itemId: a?.id ?? '', expiryDate: addDays(TODAY, -1) }],
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.ValidationError,
      details: [expect.objectContaining({ field: 'items.0.expiryDate' })],
    });
    expect(ctx.fridgeService.addItems).not.toHaveBeenCalled();
  });

  it('a fridge failure rolls everything back (list not completed, no events)', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);
    await purchase(ctx, detail.id, detail.items[0]?.id ?? '');
    ctx.fridgeService.addItems.mockRejectedValueOnce(new Error('db down'));
    ctx.events.emit.mockClear();

    await expect(ctx.service.completeTrip(FAMILY, MEMBER, detail.id, {})).rejects.toThrow(
      'db down',
    );
    expect(ctx.fridgeService.publishItemsAdded).not.toHaveBeenCalled();
    expect(ctx.events.emit).not.toHaveBeenCalled();
  });

  it('completed list: no second completion, no more purchases or new items', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A', 'B']);
    await purchase(ctx, detail.id, detail.items[0]?.id ?? '');
    await ctx.service.completeTrip(FAMILY, MEMBER, detail.id, {});

    await expect(ctx.service.completeTrip(FAMILY, MEMBER, detail.id, {})).rejects.toMatchObject({
      code: ErrorCode.InvalidStateTransition,
    });
    await expect(purchase(ctx, detail.id, detail.items[1]?.id ?? '')).rejects.toMatchObject({
      code: ErrorCode.InvalidStateTransition,
    });
    await expect(
      ctx.service.addItem(FAMILY, HOMEMAKER, detail.id, {
        itemName: 'X',
        expectedQuantity: 1,
        unitId: KG.id,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidStateTransition });
  });

  it('list of another family → 404', async () => {
    const ctx = setup();
    const detail = await createListWith(ctx, ['A']);

    await expect(
      ctx.service.completeTrip(OTHER_FAMILY, MEMBER, detail.id, {}),
    ).rejects.toMatchObject({ code: ErrorCode.NotFound });
  });
});
