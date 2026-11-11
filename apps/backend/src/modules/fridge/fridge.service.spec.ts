import {
  FridgeItemState,
  InventoryTransactionType,
  StorageLocation,
  toSearchKey,
} from '@dctl/shared';
import { type EventEmitter2 } from '@nestjs/event-emitter';
import { type DataSource, type EntityManager } from 'typeorm';
import { type BusinessClock } from '../../common/clock/business-clock';
import { AppException } from '../../common/exceptions/app.exception';
import { InsufficientStockException } from '../../common/exceptions/domain.exceptions';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { addDays } from '../../common/utils/date.util';
import { type CatalogItemResolver } from '../master-data/catalog-item.resolver';
import { type CategoriesService } from '../master-data/categories.service';
import { Category } from '../master-data/entities/category.entity';
import { Unit } from '../master-data/entities/unit.entity';
import { type UnitsService } from '../master-data/units.service';
import { FridgeItem } from './entities/fridge-item.entity';
import { InventoryTransaction } from './entities/inventory-transaction.entity';
import {
  FRIDGE_ITEM_UPDATED,
  FRIDGE_ITEMS_ADDED,
  FRIDGE_ITEMS_CONSUMED,
  FRIDGE_ITEMS_DISCARDED,
  type FridgeItemsAddedEvent,
} from './events';
import { FridgeService } from './fridge.service';
import { type FridgeItemInput } from './fridge.types';
import { type FridgeItemRepository } from './repositories/fridge-item.repository';
import { type InventoryTransactionRepository } from './repositories/inventory-transaction.repository';
import { FefoDeductionStrategy } from './strategies/stock-deduction.strategy';

const TODAY = '2026-11-11';
const FAMILY = 'family-a';
const ACTOR = 'user-a';

function unit(id: string, symbol: string, baseUnitId: string | null, factorToBase: number): Unit {
  return Object.assign(new Unit(), { id, symbol, name: symbol, baseUnitId, factorToBase });
}
const G = unit('g', 'g', null, 1);
const KG = unit('kg', 'kg', 'g', 1000);
const PACK = unit('pack', 'gói', null, 1);

const VEG = Object.assign(new Category(), {
  id: 'cat-veg',
  name: 'Củ quả',
  defaultShelfLifeDays: 7,
  storageAdvice: 'Ngăn mát',
});
const MEAT = Object.assign(new Category(), {
  id: 'cat-meat',
  name: 'Thịt',
  defaultShelfLifeDays: 2,
  storageAdvice: null,
});

let lotSeq = 0;
function lot(overrides: Partial<FridgeItem> = {}): FridgeItem {
  lotSeq++;
  return Object.assign(new FridgeItem(), {
    id: `lot-${lotSeq}`,
    familyId: FAMILY,
    foodId: 'food-tomato',
    name: 'Cà chua',
    categoryId: VEG.id,
    category: VEG,
    quantity: 1,
    unitId: KG.id,
    unit: KG,
    expiryDate: addDays(TODAY, 5),
    storageLocation: StorageLocation.Fridge,
    purchasedPrice: null,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, lotSeq)),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  });
}

function setup() {
  const manager = {} as EntityManager;
  let saved = 0;
  const fridgeItems = {
    withManager: jest.fn(),
    search: jest.fn(),
    findInFamily: jest.fn(),
    lockForDeduction: jest.fn(),
    lockByIds: jest.fn(),
    findMergeTarget: jest.fn().mockResolvedValue(null),
    find: jest.fn(),
    create: jest.fn((fields: Partial<FridgeItem>) => Object.assign(new FridgeItem(), fields)),
    save: jest.fn((entity: FridgeItem | FridgeItem[]) => {
      for (const e of Array.isArray(entity) ? entity : [entity]) {
        if (!e.id) {
          saved++;
          e.id = `new-${saved}`;
          e.createdAt = new Date();
          e.updatedAt = new Date();
        }
      }
      return Promise.resolve(entity);
    }),
  };
  fridgeItems.withManager.mockReturnValue(fridgeItems);
  const transactions = {
    withManager: jest.fn(),
    record: jest.fn((drafts: unknown[]) => Promise.resolve(drafts)),
    findByFridgeItem: jest.fn().mockResolvedValue([]),
  };
  transactions.withManager.mockReturnValue(transactions);
  const dataSource = {
    transaction: jest.fn((run: (m: EntityManager) => Promise<unknown>) => run(manager)),
  };
  const catalog = { resolve: jest.fn() };
  const categoriesService = { findMany: jest.fn().mockResolvedValue([VEG, MEAT]) };
  const unitsService = {
    findMany: jest.fn((ids: string[]) =>
      Promise.resolve([G, KG, PACK].filter((u) => ids.includes(u.id))),
    ),
  };
  const clock = { today: () => TODAY, now: () => new Date('2026-11-11T03:00:00Z') };
  const events = { emit: jest.fn() };

  const service = new FridgeService(
    dataSource as unknown as DataSource,
    fridgeItems as unknown as FridgeItemRepository,
    transactions as unknown as InventoryTransactionRepository,
    catalog as unknown as CatalogItemResolver,
    categoriesService as unknown as CategoriesService,
    unitsService as unknown as UnitsService,
    clock as unknown as BusinessClock,
    events as unknown as EventEmitter2,
    new FefoDeductionStrategy(),
  );
  return {
    service,
    manager,
    fridgeItems,
    transactions,
    dataSource,
    catalog,
    categoriesService,
    events,
  };
}

function input(overrides: Partial<FridgeItemInput> = {}): FridgeItemInput {
  return {
    foodId: 'food-tomato',
    name: 'Cà chua',
    categoryId: VEG.id,
    quantity: 1,
    unitId: KG.id,
    ...overrides,
  };
}

function expectAppError(error: unknown, code: ErrorCode): void {
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

describe('FridgeService.addItems (UC-FRIDGE-01, BR-02)', () => {
  it('creates a lot with the default expiry of its category and records ADD', async () => {
    const { service, fridgeItems, transactions, events } = setup();

    const result = await service.addItems(
      [input(), input({ foodId: 'food-pork', name: 'Thịt', categoryId: MEAT.id, unitId: G.id })],
      { familyId: FAMILY, actorId: ACTOR, source: 'manual' },
    );

    expect(result.lots.map((l) => l.expiryDate)).toEqual([addDays(TODAY, 7), addDays(TODAY, 2)]);
    expect(result.lots[0]).toMatchObject({
      familyId: FAMILY,
      storageLocation: StorageLocation.Fridge,
      purchasedPrice: null,
    });
    expect(fridgeItems.save).toHaveBeenCalledTimes(2);
    expect(transactions.record).toHaveBeenCalledWith([
      { fridgeItemId: 'new-1', type: InventoryTransactionType.Add, quantity: 1, userId: ACTOR },
      { fridgeItemId: 'new-2', type: InventoryTransactionType.Add, quantity: 1, userId: ACTOR },
    ]);
    expect(events.emit).toHaveBeenCalledWith(
      FRIDGE_ITEMS_ADDED,
      expect.objectContaining({ familyId: FAMILY, fridgeItemIds: ['new-1', 'new-2'] }),
    );
  });

  it('keeps a user-given expiry date, location and price', async () => {
    const { service } = setup();

    const { lots } = await service.addItems(
      [
        input({
          expiryDate: TODAY,
          storageLocation: StorageLocation.Freezer,
          purchasedPrice: 12000,
        }),
      ],
      { familyId: FAMILY, actorId: ACTOR, source: 'manual' },
    );

    expect(lots[0]).toMatchObject({
      expiryDate: TODAY,
      storageLocation: StorageLocation.Freezer,
      purchasedPrice: 12000,
    });
  });

  it('merges into an existing lot with the same key and adds the price', async () => {
    const { service, fridgeItems, transactions } = setup();
    const existing = lot({ quantity: 0.5, purchasedPrice: 10000, expiryDate: addDays(TODAY, 7) });
    fridgeItems.findMergeTarget.mockResolvedValueOnce(existing);

    const { lots, event } = await service.addItems([input({ purchasedPrice: 5000.5 })], {
      familyId: FAMILY,
      actorId: ACTOR,
      source: 'shopping-trip',
    });

    expect(lots[0]).toBe(existing);
    expect(existing).toMatchObject({ quantity: 1.5, purchasedPrice: 15000.5 });
    expect(fridgeItems.findMergeTarget).toHaveBeenCalledWith({
      familyId: FAMILY,
      foodId: 'food-tomato',
      name: 'Cà chua',
      unitId: KG.id,
      expiryDate: addDays(TODAY, 7),
      storageLocation: StorageLocation.Fridge,
    });
    expect(transactions.record).toHaveBeenCalledWith([
      expect.objectContaining({ fridgeItemId: existing.id, quantity: 1 }),
    ]);
    expect(event.source).toBe('shopping-trip');
  });

  it('merges two identical lines of one batch into one lot (free-text names too)', async () => {
    const { service, fridgeItems } = setup();
    const free = { foodId: null, name: 'Bánh mì', unitId: PACK.id };

    const { lots, event } = await service.addItems([input(free), input(free)], {
      familyId: FAMILY,
      actorId: ACTOR,
      source: 'manual',
    });

    expect(lots[0]).toBe(lots[1]);
    expect(lots[0]?.quantity).toBe(2);
    expect(fridgeItems.findMergeTarget).toHaveBeenCalledTimes(1);
    expect(event.fridgeItemIds).toEqual(['new-1']);
  });

  it('joins the caller transaction and does not publish (completeTrip)', async () => {
    const { service, dataSource, events, manager, fridgeItems } = setup();

    const result = await service.addItems([input()], {
      familyId: FAMILY,
      actorId: ACTOR,
      source: 'shopping-trip',
      manager,
    });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(fridgeItems.withManager).toHaveBeenCalledWith(manager);
    expect(events.emit).not.toHaveBeenCalled();

    service.publishItemsAdded(result);
    expect(events.emit).toHaveBeenCalledWith(FRIDGE_ITEMS_ADDED, result.event);
  });

  it.each([
    [addDays(TODAY, -1), false],
    [TODAY, true],
  ])('expiry %s accepted = %s (BVA: không trước hôm nay)', async (expiryDate, ok) => {
    const { service } = setup();
    const run = service.addItems([input({ expiryDate })], {
      familyId: FAMILY,
      actorId: ACTOR,
      source: 'manual',
    });

    if (ok) {
      await expect(run).resolves.toBeDefined();
    } else {
      await expect(run).rejects.toMatchObject({
        code: ErrorCode.ValidationError,
        details: [expect.objectContaining({ field: 'items.0.expiryDate' })],
      });
    }
  });

  it('rejects an unknown category', async () => {
    const { service, categoriesService } = setup();
    categoriesService.findMany.mockResolvedValueOnce([]);

    await expect(
      service.addItems([input()], { familyId: FAMILY, actorId: ACTOR, source: 'manual' }),
    ).rejects.toMatchObject({
      code: ErrorCode.ValidationError,
      details: [expect.objectContaining({ field: 'items.0.categoryId' })],
    });
  });
});

describe('FridgeService.addManualItems', () => {
  it('validates master data with the resolver then returns the reloaded lots', async () => {
    const { service, catalog, fridgeItems } = setup();
    catalog.resolve.mockResolvedValue([
      {
        foodId: 'food-tomato',
        name: 'Cà chua',
        categoryId: VEG.id,
        unitId: KG.id,
        category: VEG,
        unit: KG,
      },
    ]);
    fridgeItems.find.mockImplementation(() => Promise.resolve([lot({ id: 'new-1', quantity: 2 })]));

    const responses = await service.addManualItems(FAMILY, ACTOR, {
      items: [{ foodId: 'food-tomato', quantity: 2, unitId: KG.id, purchasedPrice: 1000 }],
    });

    expect(catalog.resolve).toHaveBeenCalledWith(FAMILY, [
      expect.objectContaining({ foodId: 'food-tomato' }),
    ]);
    expect(responses).toEqual([
      expect.objectContaining({
        id: 'new-1',
        quantity: 2,
        categoryName: 'Củ quả',
        storageAdvice: 'Ngăn mát',
        unitSymbol: 'kg',
        state: FridgeItemState.Fresh,
        daysUntilExpiry: 5,
      }),
    ]);
  });
});

describe('FridgeService.search (UC-FRIDGE-02, FR-12)', () => {
  it.each([
    [FridgeItemState.Expired, { until: TODAY }],
    [FridgeItemState.ExpiringSoon, { after: TODAY, until: addDays(TODAY, 3) }],
    [FridgeItemState.Fresh, { after: addDays(TODAY, 3) }],
  ] as const)('maps state %s to the BR-01 date window', async (state, window) => {
    const { service, fridgeItems } = setup();
    fridgeItems.search.mockResolvedValue([[], 0]);

    await service.search(FAMILY, Object.assign(pageQuery(), { state }));

    expect(fridgeItems.search).toHaveBeenCalledWith(expect.objectContaining({ window }));
  });

  it('searches without accents, pages and computes the state of each lot', async () => {
    const { service, fridgeItems } = setup();
    fridgeItems.search.mockResolvedValue([[lot({ expiryDate: addDays(TODAY, 1) })], 1]);

    const page = await service.search(FAMILY, Object.assign(pageQuery(), { q: 'Cà Chua' }));

    expect(fridgeItems.search).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: FAMILY,
        key: toSearchKey('Cà Chua'),
        window: undefined,
        offset: 0,
        limit: 20,
      }),
    );
    expect(page.meta).toEqual({ total: 1, page: 1, pageSize: 20 });
    expect(page.items[0]?.state).toBe(FridgeItemState.ExpiringSoon);
  });

  it('ignores a blank keyword', async () => {
    const { service, fridgeItems } = setup();
    fridgeItems.search.mockResolvedValue([[], 0]);

    await service.search(FAMILY, Object.assign(pageQuery(), { q: '   ' }));

    expect(fridgeItems.search).toHaveBeenCalledWith(expect.objectContaining({ key: undefined }));
  });
});

describe('FridgeService.getDetail / updateItem', () => {
  it('returns the lot with its history; an empty lot gets its state from the last transaction', async () => {
    const { service, fridgeItems, transactions } = setup();
    fridgeItems.findInFamily.mockResolvedValue(lot({ quantity: 0 }));
    const discard = Object.assign(new InventoryTransaction(), {
      id: 't2',
      type: InventoryTransactionType.Discard,
      quantity: 1,
      userId: ACTOR,
      createdAt: new Date('2026-11-10T00:00:00Z'),
    });
    transactions.findByFridgeItem.mockResolvedValue([discard]);

    const detail = await service.getDetail(FAMILY, 'lot-x');

    expect(detail.state).toBe(FridgeItemState.Discarded);
    expect(detail.transactions).toEqual([
      expect.objectContaining({ id: 't2', type: InventoryTransactionType.Discard }),
    ]);
  });

  it('404 for a lot of another family (BR-06)', async () => {
    const { service, fridgeItems } = setup();
    fridgeItems.findInFamily.mockResolvedValue(null);

    await expect(service.getDetail(FAMILY, 'other')).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });
  });

  it('updates expiry, location and clears the price', async () => {
    const { service, fridgeItems, events } = setup();
    const target = lot({ purchasedPrice: 5000 });
    fridgeItems.lockByIds.mockResolvedValue([target]);
    fridgeItems.findInFamily.mockResolvedValue(target);

    const response = await service.updateItem(FAMILY, ACTOR, target.id, {
      expiryDate: addDays(TODAY, 1),
      storageLocation: StorageLocation.Pantry,
      purchasedPrice: null as unknown as number,
    });

    expect(target).toMatchObject({
      expiryDate: addDays(TODAY, 1),
      storageLocation: StorageLocation.Pantry,
      purchasedPrice: null,
    });
    expect(response.state).toBe(FridgeItemState.ExpiringSoon);
    expect(events.emit).toHaveBeenCalledWith(
      FRIDGE_ITEM_UPDATED,
      expect.objectContaining({ fridgeItemId: target.id }),
    );
  });

  it('update: past expiry → 400, unknown lot → 404', async () => {
    const { service, fridgeItems } = setup();
    fridgeItems.lockByIds.mockResolvedValue([]);

    await expect(
      service.updateItem(FAMILY, ACTOR, 'x', { expiryDate: addDays(TODAY, -1) }),
    ).rejects.toMatchObject({ code: ErrorCode.ValidationError });
    await expect(
      service.updateItem(FAMILY, ACTOR, 'x', { storageLocation: StorageLocation.Pantry }),
    ).rejects.toMatchObject({ code: ErrorCode.NotFound });
  });
});

describe('FridgeService.consumeItems (UC-FRIDGE-03, BR-03 FEFO)', () => {
  it('consumes a food by FEFO across lots and units, one CONSUME row per lot', async () => {
    const { service, fridgeItems, transactions, events } = setup();
    const soon = lot({ quantity: 0.3, expiryDate: addDays(TODAY, 1) });
    const later = lot({ quantity: 500, unitId: G.id, unit: G, expiryDate: addDays(TODAY, 4) });
    const expired = lot({ quantity: 2, expiryDate: TODAY });
    fridgeItems.lockForDeduction.mockResolvedValue([later, expired, soon]);

    const changes = await service.consumeItems(FAMILY, ACTOR, {
      items: [{ foodId: 'food-tomato', quantity: 0.5, unitId: KG.id }],
    });

    expect(fridgeItems.lockForDeduction).toHaveBeenCalledWith(FAMILY, [], ['food-tomato']);
    expect(changes).toEqual([
      expect.objectContaining({ fridgeItemId: soon.id, quantity: 0.3, remaining: 0 }),
      expect.objectContaining({ fridgeItemId: later.id, quantity: 200, remaining: 300 }),
    ]);
    expect(changes[0]?.state).toBe(FridgeItemState.Consumed);
    expect(expired.quantity).toBe(2);
    expect(transactions.record).toHaveBeenCalledWith([
      {
        fridgeItemId: soon.id,
        type: InventoryTransactionType.Consume,
        quantity: 0.3,
        userId: ACTOR,
      },
      {
        fridgeItemId: later.id,
        type: InventoryTransactionType.Consume,
        quantity: 200,
        userId: ACTOR,
      },
    ]);
    expect(events.emit).toHaveBeenCalledWith(FRIDGE_ITEMS_CONSUMED, expect.anything());
  });

  it('consumes an explicit lot (even expired), converting the unit', async () => {
    const { service, fridgeItems } = setup();
    const expired = lot({ quantity: 1, expiryDate: addDays(TODAY, -1) });
    fridgeItems.lockForDeduction.mockResolvedValue([expired]);

    const [change] = await service.consumeItems(FAMILY, ACTOR, {
      items: [{ fridgeItemId: expired.id, quantity: 250, unitId: G.id }],
    });

    expect(change).toMatchObject({ quantity: 0.25, remaining: 0.75 });
  });

  it('sums several lines on the same lot into one transaction', async () => {
    const { service, fridgeItems, transactions } = setup();
    const only = lot({ quantity: 1 });
    fridgeItems.lockForDeduction.mockResolvedValue([only]);

    await service.consumeItems(FAMILY, ACTOR, {
      items: [
        { fridgeItemId: only.id, quantity: 0.2 },
        { foodId: 'food-tomato', quantity: 0.3, unitId: KG.id },
      ],
    });

    expect(only.quantity).toBe(0.5);
    expect(transactions.record).toHaveBeenCalledWith([
      expect.objectContaining({ fridgeItemId: only.id, quantity: 0.5 }),
    ]);
  });

  describe('BVA on one lot of 1 kg', () => {
    it.each([
      [0.999, 0.001],
      [1, 0],
    ])('consume %d → remaining %d', async (quantity, remaining) => {
      const { service, fridgeItems } = setup();
      const one = lot({ quantity: 1 });
      fridgeItems.lockForDeduction.mockResolvedValue([one]);

      const [change] = await service.consumeItems(FAMILY, ACTOR, {
        items: [{ fridgeItemId: one.id, quantity }],
      });

      expect(change?.remaining).toBe(remaining);
    });

    it('consume 1.001 → 409 FRIDGE_INSUFFICIENT_STOCK and nothing is written', async () => {
      const { service, fridgeItems, transactions, events } = setup();
      fridgeItems.lockForDeduction.mockResolvedValue([lot({ quantity: 1 })]);

      await expect(
        service.consumeItems(FAMILY, ACTOR, {
          items: [{ foodId: 'food-tomato', quantity: 1.001, unitId: KG.id }],
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.InsufficientStock,
        details: expect.objectContaining({
          line: 0,
          foodId: 'food-tomato',
          available: 1,
        }) as unknown,
      });
      expect(fridgeItems.save).not.toHaveBeenCalled();
      expect(transactions.record).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  it.each([
    [{ quantity: 1 }, 'items.0.fridgeItemId'],
    [{ fridgeItemId: 'l', foodId: 'f', quantity: 1 }, 'items.0.fridgeItemId'],
    [{ foodId: 'f', quantity: 1 }, 'items.0.unitId'],
  ])('rejects line %p (EP: đúng một trong fridgeItemId/foodId)', async (line, field) => {
    const { service } = setup();

    await expect(service.consumeItems(FAMILY, ACTOR, { items: [line] })).rejects.toMatchObject({
      code: ErrorCode.ValidationError,
      details: [expect.objectContaining({ field })],
    });
  });

  it('unknown request unit → 400; lot of another family → 404; other group → 422', async () => {
    const { service, fridgeItems } = setup();
    const one = lot();
    fridgeItems.lockForDeduction.mockResolvedValue([one]);

    await expect(
      service.consumeItems(FAMILY, ACTOR, {
        items: [{ fridgeItemId: one.id, quantity: 1, unitId: 'missing' }],
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ValidationError });
    await expect(
      service.consumeItems(FAMILY, ACTOR, { items: [{ fridgeItemId: 'other', quantity: 1 }] }),
    ).rejects.toMatchObject({ code: ErrorCode.NotFound });
    await expect(
      service.consumeItems(FAMILY, ACTOR, {
        items: [{ fridgeItemId: one.id, quantity: 1, unitId: PACK.id }],
      }),
    ).rejects.toMatchObject({ code: ErrorCode.UnitIncompatible });
  });
});

describe('FridgeService.discardItems (BR-05: lãng phí)', () => {
  it('discards the whole remaining stock by default, or a part', async () => {
    const { service, fridgeItems, transactions, events } = setup();
    const a = lot({ quantity: 0.4, expiryDate: addDays(TODAY, -1) });
    const b = lot({ quantity: 1 });
    fridgeItems.lockByIds.mockResolvedValue([a, b]);

    const changes = await service.discardItems(FAMILY, ACTOR, {
      items: [{ fridgeItemId: a.id }, { fridgeItemId: b.id, quantity: 0.25 }],
    });

    expect(changes).toEqual([
      expect.objectContaining({ fridgeItemId: a.id, quantity: 0.4, remaining: 0 }),
      expect.objectContaining({ fridgeItemId: b.id, quantity: 0.25, remaining: 0.75 }),
    ]);
    expect(changes[0]?.state).toBe(FridgeItemState.Discarded);
    expect(transactions.record).toHaveBeenCalledWith([
      expect.objectContaining({ type: InventoryTransactionType.Discard, quantity: 0.4 }),
      expect.objectContaining({ type: InventoryTransactionType.Discard, quantity: 0.25 }),
    ]);
    expect(events.emit).toHaveBeenCalledWith(FRIDGE_ITEMS_DISCARDED, expect.anything());
  });

  it('empty lot → 409; more than available → 409; unknown lot → 404', async () => {
    const { service, fridgeItems } = setup();
    const empty = lot({ quantity: 0 });
    const one = lot({ quantity: 1 });
    fridgeItems.lockByIds.mockResolvedValue([empty, one]);

    const emptyError: unknown = await service
      .discardItems(FAMILY, ACTOR, { items: [{ fridgeItemId: empty.id }] })
      .catch((e: unknown) => e);
    expect(emptyError).toBeInstanceOf(InsufficientStockException);
    await expect(
      service.discardItems(FAMILY, ACTOR, { items: [{ fridgeItemId: one.id, quantity: 2 }] }),
    ).rejects.toMatchObject({ code: ErrorCode.InsufficientStock });
    const missing: unknown = await service
      .discardItems(FAMILY, ACTOR, { items: [{ fridgeItemId: 'nope' }] })
      .catch((e: unknown) => e);
    expectAppError(missing, ErrorCode.NotFound);
  });
});

describe('FridgeItemsAddedEvent', () => {
  it('lists each lot once', async () => {
    const { service, fridgeItems } = setup();
    const existing = lot();
    fridgeItems.findMergeTarget.mockResolvedValue(existing);

    const { event }: { event: FridgeItemsAddedEvent } = await service.addItems(
      [input({ expiryDate: existing.expiryDate }), input({ expiryDate: existing.expiryDate })],
      { familyId: FAMILY, actorId: ACTOR, source: 'manual' },
    );

    expect(event.fridgeItemIds).toEqual([existing.id]);
  });
});

function pageQuery() {
  return { page: 1, pageSize: 20, offset: 0 } as {
    page: number;
    pageSize: number;
    offset: number;
    q?: string;
    state?: FridgeItemState.Fresh | FridgeItemState.ExpiringSoon | FridgeItemState.Expired;
  };
}
