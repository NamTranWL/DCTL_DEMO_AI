import {
  EXPIRY_SOON_DAYS,
  FridgeItemState,
  InventoryTransactionType,
  StorageLocation,
  toSearchKey,
} from '@dctl/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, type EntityManager, In } from 'typeorm';
import { BusinessClock } from '../../common/clock/business-clock';
import { AppException } from '../../common/exceptions/app.exception';
import { InsufficientStockException } from '../../common/exceptions/domain.exceptions';
import { Paged } from '../../common/interceptors/transform.interceptor';
import { addDays, type IsoDate } from '../../common/utils/date.util';
import { QUANTITY_SCALE, UnitConverter } from '../master-data/units/unit-converter';
import { CatalogItemResolver } from '../master-data/catalog-item.resolver';
import { CategoriesService } from '../master-data/categories.service';
import { type Unit } from '../master-data/entities/unit.entity';
import { UnitsService } from '../master-data/units.service';
import {
  type AddFridgeItemsDto,
  type ConsumeItemsDto,
  type DiscardItemsDto,
  FridgeItemDetailResponse,
  FridgeItemResponse,
  InventoryTransactionResponse,
  type SearchableState,
  type SearchFridgeItemsQueryDto,
  type StockChangeResponse,
  type UpdateFridgeItemDto,
} from './dto/fridge.dto';
import { type FridgeItem } from './entities/fridge-item.entity';
import {
  FRIDGE_ITEM_UPDATED,
  FRIDGE_ITEMS_ADDED,
  FRIDGE_ITEMS_CONSUMED,
  FRIDGE_ITEMS_DISCARDED,
  FridgeItemsAddedEvent,
  FridgeItemsConsumedEvent,
  FridgeItemsDiscardedEvent,
  FridgeItemUpdatedEvent,
  type StockChange,
} from './events';
import {
  type AddItemsContext,
  type ConsumeLine,
  type FridgeAddResult,
  type FridgeItemInput,
} from './fridge.types';
import { type ExpiryWindow, FridgeItemRepository } from './repositories/fridge-item.repository';
import { InventoryTransactionRepository } from './repositories/inventory-transaction.repository';
import {
  STOCK_DEDUCTION_STRATEGY,
  type StockDeductionStrategy,
  type StockLot,
} from './strategies/stock-deduction.strategy';

interface FieldError {
  field: string;
  constraints: Record<string, string>;
}

function round(value: number, scale = QUANTITY_SCALE): number {
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Sums the amount taken from each lot within one request (one inventory row per lot). */
class StockLedger {
  private readonly entries = new Map<string, { lot: FridgeItem; quantity: number }>();

  add(lot: FridgeItem, quantity: number): void {
    const entry = this.entries.get(lot.id);
    if (entry) {
      entry.quantity = round(entry.quantity + quantity);
    } else {
      this.entries.set(lot.id, { lot, quantity });
    }
  }

  lots(): FridgeItem[] {
    return [...this.entries.values()].map((e) => e.lot);
  }

  changes(): StockChange[] {
    return [...this.entries.values()].map(({ lot, quantity }) => ({
      fridgeItemId: lot.id,
      foodId: lot.foodId,
      quantity,
      unitId: lot.unitId,
      remaining: lot.quantity,
    }));
  }
}

/**
 * Quản lý kho thực phẩm của gia đình: nhập (thủ công hoặc từ chuyến đi chợ), tra cứu, ghi nhận
 * sử dụng theo FEFO, huỷ (lãng phí), sửa hạn dùng. Mọi thay đổi số lượng chạy trong một
 * transaction có khoá dòng và ghi một bản ghi inventory_transactions (ADD/CONSUME/DISCARD).
 * family_id luôn lấy từ phiên đăng nhập (BR-06).
 * @uc UC-FRIDGE-01, UC-FRIDGE-02, UC-FRIDGE-03, UC-SHOP-03
 * @fr FR-08, FR-09, FR-11, FR-12, FR-13  @br BR-01, BR-02, BR-03, BR-04, BR-05, BR-06
 */
@Injectable()
export class FridgeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fridgeItems: FridgeItemRepository,
    private readonly transactions: InventoryTransactionRepository,
    private readonly catalog: CatalogItemResolver,
    private readonly categoriesService: CategoriesService,
    private readonly unitsService: UnitsService,
    private readonly clock: BusinessClock,
    private readonly events: EventEmitter2,
    @Inject(STOCK_DEDUCTION_STRATEGY) private readonly deduction: StockDeductionStrategy,
  ) {}

  /**
   * Nhập kho thủ công: kiểm tra master data (BR-04) rồi gọi addItems().
   * @uc UC-FRIDGE-01  @fr FR-09  @br BR-02, BR-04, BR-06
   */
  async addManualItems(
    familyId: string,
    actorId: string,
    dto: AddFridgeItemsDto,
  ): Promise<FridgeItemResponse[]> {
    const resolved = await this.catalog.resolve(familyId, dto.items);
    const inputs: FridgeItemInput[] = resolved.map((item, index) => {
      const line = dto.items[index];
      return {
        foodId: item.foodId,
        name: item.name,
        categoryId: item.categoryId,
        unitId: item.unitId,
        quantity: line?.quantity ?? 0,
        expiryDate: line?.expiryDate ?? null,
        storageLocation: line?.storageLocation,
        purchasedPrice: line?.purchasedPrice ?? null,
      };
    });
    const result = await this.addItems(inputs, { familyId, actorId, source: 'manual' });
    return this.toResponses(familyId, result.lots);
  }

  /**
   * Đưa thực phẩm vào kho (5.1 bước 7). Hạn dùng không gửi → hôm nay + hạn mặc định của danh
   * mục (BR-02); hạn gửi lên không được trước hôm nay. Lô trùng (cùng thực phẩm/tên, đơn vị,
   * hạn, vị trí) được cộng dồn. Mỗi dòng ghi một giao dịch ADD.
   * Có `context.manager` → chạy trong transaction của người gọi và KHÔNG phát sự kiện; người
   * gọi phát `result.event` bằng publishItemsAdded() sau khi commit.
   * @uc UC-FRIDGE-01, UC-SHOP-03  @fr FR-08, FR-09  @br BR-02, BR-04, BR-06
   */
  async addItems(
    inputs: readonly FridgeItemInput[],
    context: AddItemsContext,
  ): Promise<FridgeAddResult> {
    const today = this.clock.today();
    this.assertExpiryDates(
      inputs.map((input) => input.expiryDate ?? null),
      today,
      'items',
    );
    const categories = await this.categoriesService.findMany(inputs.map((i) => i.categoryId));
    const shelfLife = new Map(categories.map((c) => [c.id, c.defaultShelfLifeDays]));
    const missing = inputs.findIndex((input) => !shelfLife.has(input.categoryId));
    if (missing >= 0) {
      throw AppException.validation([
        {
          field: `items.${missing}.categoryId`,
          constraints: { exists: 'Danh mục không tồn tại.' },
        },
      ]);
    }

    const run = (manager: EntityManager): Promise<FridgeAddResult> =>
      this.addWithin(manager, inputs, context, (input) =>
        input.expiryDate ? input.expiryDate : addDays(today, shelfLife.get(input.categoryId) ?? 0),
      );

    if (context.manager) {
      return run(context.manager);
    }
    const result = await this.dataSource.transaction(run);
    this.publishItemsAdded(result);
    return result;
  }

  /**
   * Phát FRIDGE_ITEMS_ADDED sau khi transaction của người gọi đã commit (completeTrip).
   * @uc UC-SHOP-03  @fr FR-08
   */
  publishItemsAdded(result: FridgeAddResult): void {
    this.events.emit(FRIDGE_ITEMS_ADDED, result.event);
  }

  /**
   * Tra cứu kho theo tên (không dấu) hoặc danh mục, lọc vị trí và trạng thái hạn; chỉ lô còn
   * hàng, hạn sớm nhất trước. Kèm gợi ý bảo quản của danh mục.
   * @uc UC-FRIDGE-02  @fr FR-11, FR-12  @br BR-01, BR-06
   */
  async search(
    familyId: string,
    query: SearchFridgeItemsQueryDto,
  ): Promise<Paged<FridgeItemResponse>> {
    const today = this.clock.today();
    const key = query.q ? toSearchKey(query.q) : '';
    const [items, total] = await this.fridgeItems.search({
      familyId,
      key: key.length > 0 ? key : undefined,
      categoryId: query.categoryId,
      foodId: query.foodId,
      storageLocation: query.storageLocation,
      window: query.state ? this.expiryWindow(query.state, today) : undefined,
      offset: query.offset,
      limit: query.pageSize,
    });
    return new Paged(
      items.map((item) => FridgeItemResponse.from(item, today)),
      { total, page: query.page, pageSize: query.pageSize },
    );
  }

  /**
   * Chi tiết một lô kèm lịch sử giao dịch (kể cả lô đã dùng hết / đã huỷ).
   * @uc UC-FRIDGE-02  @fr FR-12, FR-13  @br BR-06
   */
  async getDetail(familyId: string, id: string): Promise<FridgeItemDetailResponse> {
    const item = await this.getLot(familyId, id);
    const history = await this.transactions.findByFridgeItem(item.id);
    const base = FridgeItemResponse.from(item, this.clock.today(), history[0]?.type);
    return Object.assign(new FridgeItemDetailResponse(), base, {
      transactions: history.map((t) => InventoryTransactionResponse.from(t)),
    });
  }

  /**
   * Sửa hạn dùng / vị trí / giá của một lô (BR-02: người dùng sửa được hạn mặc định).
   * @uc UC-FRIDGE-01  @fr FR-09  @br BR-02, BR-06
   */
  async updateItem(
    familyId: string,
    actorId: string,
    id: string,
    dto: UpdateFridgeItemDto,
  ): Promise<FridgeItemResponse> {
    const today = this.clock.today();
    if (dto.expiryDate !== undefined) {
      this.assertExpiryDates([dto.expiryDate], today, null);
    }
    await this.dataSource.transaction(async (manager) => {
      const repo = this.fridgeItems.withManager(manager);
      const [lot] = await repo.lockByIds(familyId, [id]);
      if (!lot) {
        throw this.lotNotFound();
      }
      if (dto.expiryDate !== undefined) {
        lot.expiryDate = dto.expiryDate;
      }
      if (dto.storageLocation !== undefined) {
        lot.storageLocation = dto.storageLocation;
      }
      if (dto.purchasedPrice !== undefined) {
        lot.purchasedPrice = dto.purchasedPrice ?? null;
      }
      await repo.save(lot);
    });
    this.events.emit(FRIDGE_ITEM_UPDATED, new FridgeItemUpdatedEvent(familyId, id, actorId));
    return FridgeItemResponse.from(await this.getLot(familyId, id), today);
  }

  /**
   * Ghi nhận sử dụng (5.2): mỗi dòng trừ một lô chọn đích danh, hoặc trừ một thực phẩm theo
   * FEFO trên các lô còn hạn (quy đổi đơn vị cùng nhóm). Tất cả hoặc không: một dòng không đủ
   * hàng → 409 FRIDGE_INSUFFICIENT_STOCK, không trừ gì. Ghi giao dịch CONSUME.
   * @uc UC-FRIDGE-03  @fr FR-13  @br BR-03, BR-04, BR-06
   */
  async consumeItems(
    familyId: string,
    actorId: string,
    dto: ConsumeItemsDto,
  ): Promise<StockChangeResponse[]> {
    const lines = this.validateConsumeLines(dto);
    const today = this.clock.today();

    const ledger = await this.dataSource.transaction(async (manager) => {
      const repo = this.fridgeItems.withManager(manager);
      const lots = await repo.lockForDeduction(
        familyId,
        lines.flatMap((l) => (l.fridgeItemId ? [l.fridgeItemId] : [])),
        lines.flatMap((l) => (l.foodId ? [l.foodId] : [])),
      );
      const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
      const units = await this.loadUnits([
        ...lots.map((lot) => lot.unitId),
        ...lines.flatMap((l) => (l.unitId ? [l.unitId] : [])),
      ]);

      const result = new StockLedger();
      lines.forEach((line, index) => {
        const requestUnit = line.unitId ? units.get(line.unitId) : undefined;
        if (line.unitId && !requestUnit) {
          throw AppException.validation([
            { field: `items.${index}.unitId`, constraints: { exists: 'Đơn vị không tồn tại.' } },
          ]);
        }
        if (line.fridgeItemId !== undefined) {
          const lot = lotsById.get(line.fridgeItemId);
          if (!lot) {
            throw this.lotNotFound();
          }
          const lotUnit = this.unitOf(units, lot);
          const amount = requestUnit
            ? UnitConverter.convert(line.quantity, requestUnit, lotUnit)
            : line.quantity;
          result.add(lot, lot.decrease(amount));
          return;
        }
        this.consumeFefo(
          line.foodId,
          line.quantity,
          requestUnit,
          lots,
          units,
          today,
          index,
        ).forEach(({ lot, quantity }) => result.add(lot, lot.decrease(quantity)));
      });

      await repo.save(result.lots());
      await this.transactions.withManager(manager).record(
        result.changes().map((change) => ({
          fridgeItemId: change.fridgeItemId,
          type: InventoryTransactionType.Consume,
          quantity: change.quantity,
          userId: actorId,
        })),
      );
      return result;
    });

    this.events.emit(
      FRIDGE_ITEMS_CONSUMED,
      new FridgeItemsConsumedEvent(familyId, ledger.changes(), actorId),
    );
    return this.toChangeResponses(ledger, today, InventoryTransactionType.Consume);
  }

  /**
   * Huỷ thực phẩm hết hạn/hỏng (5.2): trừ một phần hoặc toàn bộ phần còn lại của lô, ghi giao
   * dịch DISCARD — tính là lãng phí cho báo cáo (FR-23).
   * @uc UC-FRIDGE-03  @fr FR-13, FR-23  @br BR-03, BR-05, BR-06
   */
  async discardItems(
    familyId: string,
    actorId: string,
    dto: DiscardItemsDto,
  ): Promise<StockChangeResponse[]> {
    const today = this.clock.today();
    const ledger = await this.dataSource.transaction(async (manager) => {
      const repo = this.fridgeItems.withManager(manager);
      const lots = await repo.lockByIds(
        familyId,
        dto.items.map((line) => line.fridgeItemId),
      );
      const lotsById = new Map(lots.map((lot) => [lot.id, lot]));

      const result = new StockLedger();
      for (const line of dto.items) {
        const lot = lotsById.get(line.fridgeItemId);
        if (!lot) {
          throw this.lotNotFound();
        }
        if (!lot.isInStock()) {
          throw new InsufficientStockException(
            { fridgeItemId: lot.id, name: lot.name, available: 0 },
            'Lô thực phẩm này đã hết hàng.',
          );
        }
        result.add(lot, lot.decrease(line.quantity ?? lot.quantity));
      }

      await repo.save(result.lots());
      await this.transactions.withManager(manager).record(
        result.changes().map((change) => ({
          fridgeItemId: change.fridgeItemId,
          type: InventoryTransactionType.Discard,
          quantity: change.quantity,
          userId: actorId,
        })),
      );
      return result;
    });

    this.events.emit(
      FRIDGE_ITEMS_DISCARDED,
      new FridgeItemsDiscardedEvent(familyId, ledger.changes(), actorId),
    );
    return this.toChangeResponses(ledger, today, InventoryTransactionType.Discard);
  }

  /** Insert or merge every input inside `manager`'s transaction. */
  private async addWithin(
    manager: EntityManager,
    inputs: readonly FridgeItemInput[],
    context: AddItemsContext,
    expiryOf: (input: FridgeItemInput) => IsoDate,
  ): Promise<FridgeAddResult> {
    const repo = this.fridgeItems.withManager(manager);
    const batch = new Map<string, FridgeItem>();
    const lots: FridgeItem[] = [];

    for (const input of inputs) {
      const key = {
        familyId: context.familyId,
        foodId: input.foodId,
        name: input.name,
        unitId: input.unitId,
        expiryDate: expiryOf(input),
        storageLocation: input.storageLocation ?? StorageLocation.Fridge,
      };
      const batchKey = [
        key.foodId ?? `name:${key.name}`,
        key.unitId,
        key.expiryDate,
        key.storageLocation,
      ].join('|');

      let lot = batch.get(batchKey) ?? (await repo.findMergeTarget(key));
      if (lot) {
        lot.increase(input.quantity);
        if (input.purchasedPrice !== null && input.purchasedPrice !== undefined) {
          lot.purchasedPrice = round((lot.purchasedPrice ?? 0) + input.purchasedPrice, 2);
        }
      } else {
        lot = repo.create({
          familyId: context.familyId,
          foodId: input.foodId,
          name: input.name,
          categoryId: input.categoryId,
          quantity: input.quantity,
          unitId: input.unitId,
          expiryDate: key.expiryDate,
          storageLocation: key.storageLocation,
          purchasedPrice: input.purchasedPrice ?? null,
        });
      }
      lot = await repo.save(lot);
      batch.set(batchKey, lot);
      lots.push(lot);
    }

    await this.transactions.withManager(manager).record(
      inputs.map((input, index) => ({
        fridgeItemId: lots[index]?.id ?? '',
        type: InventoryTransactionType.Add,
        quantity: input.quantity,
        userId: context.actorId,
      })),
    );
    const ids = [...new Set(lots.map((lot) => lot.id))];
    return {
      lots,
      event: new FridgeItemsAddedEvent(context.familyId, ids, context.source, context.actorId),
    };
  }

  /** FEFO allocation for one food line; lots already reduced by earlier lines are respected. */
  private consumeFefo(
    foodId: string,
    quantity: number,
    unit: Unit | undefined,
    lots: readonly FridgeItem[],
    units: ReadonlyMap<string, Unit>,
    today: IsoDate,
    index: number,
  ): { lot: FridgeItem; quantity: number }[] {
    const candidates = lots.filter((lot) => lot.foodId === foodId);
    const byId = new Map(candidates.map((lot) => [lot.id, lot]));
    const stockLots: StockLot[] = candidates.map((lot) => ({
      id: lot.id,
      quantity: lot.quantity,
      unit: this.unitOf(units, lot),
      expiryDate: lot.expiryDate,
      createdAt: lot.createdAt,
    }));
    if (!unit) {
      // validateConsumeLines guarantees unitId for food lines; defensive guard for typing.
      throw AppException.validation([
        { field: `items.${index}.unitId`, constraints: { required: 'Vui lòng chọn đơn vị.' } },
      ]);
    }
    try {
      return this.deduction.allocate(stockLots, { quantity, unit }, today).map((allocation) => ({
        lot: byId.get(allocation.lotId) as FridgeItem,
        quantity: allocation.quantity,
      }));
    } catch (error: unknown) {
      if (error instanceof InsufficientStockException) {
        const details = (error.details ?? {}) as Record<string, unknown>;
        throw new InsufficientStockException(
          { ...details, line: index, foodId },
          'Số lượng còn hạn trong kho không đủ cho thực phẩm này.',
        );
      }
      throw error;
    }
  }

  /** Exactly one of fridgeItemId / foodId per line; foodId lines need a unit. */
  private validateConsumeLines(dto: ConsumeItemsDto): ConsumeLine[] {
    const errors: FieldError[] = [];
    const lines: ConsumeLine[] = [];
    dto.items.forEach((line, index) => {
      const hasLot = line.fridgeItemId !== undefined;
      const hasFood = line.foodId !== undefined;
      if (hasLot === hasFood) {
        errors.push({
          field: `items.${index}.fridgeItemId`,
          constraints: { oneOf: 'Chọn một lô (fridgeItemId) hoặc một thực phẩm (foodId).' },
        });
      } else if (line.foodId !== undefined && line.unitId === undefined) {
        errors.push({
          field: `items.${index}.unitId`,
          constraints: { required: 'Vui lòng chọn đơn vị khi trừ theo thực phẩm.' },
        });
      } else if (line.foodId !== undefined && line.unitId !== undefined) {
        lines.push({ foodId: line.foodId, quantity: line.quantity, unitId: line.unitId });
      } else if (line.fridgeItemId !== undefined) {
        lines.push({
          fridgeItemId: line.fridgeItemId,
          quantity: line.quantity,
          unitId: line.unitId,
        });
      }
    });
    if (errors.length > 0) {
      throw AppException.validation(errors);
    }
    return lines;
  }

  /** Expiry dates sent by the user must not be in the past (today is allowed). @br BR-02 */
  private assertExpiryDates(
    dates: readonly (IsoDate | null)[],
    today: IsoDate,
    field: string | null,
  ): void {
    const errors: FieldError[] = [];
    dates.forEach((date, index) => {
      if (date !== null && date < today) {
        errors.push({
          field: field === null ? 'expiryDate' : `${field}.${index}.expiryDate`,
          constraints: { notPast: 'Hạn dùng không được trước hôm nay.' },
        });
      }
    });
    if (errors.length > 0) {
      throw AppException.validation(errors);
    }
  }

  /** BR-01 windows: EXPIRED ≤ today < EXPIRING_SOON ≤ today+3 < FRESH. */
  private expiryWindow(state: SearchableState, today: IsoDate): ExpiryWindow {
    const soonLimit = addDays(today, EXPIRY_SOON_DAYS);
    switch (state) {
      case FridgeItemState.Expired:
        return { until: today };
      case FridgeItemState.ExpiringSoon:
        return { after: today, until: soonLimit };
      case FridgeItemState.Fresh:
        return { after: soonLimit };
    }
  }

  private async loadUnits(ids: readonly string[]): Promise<Map<string, Unit>> {
    const units = await this.unitsService.findMany(ids);
    return new Map(units.map((unit) => [unit.id, unit]));
  }

  private unitOf(units: ReadonlyMap<string, Unit>, lot: FridgeItem): Unit {
    const unit = units.get(lot.unitId);
    if (!unit) {
      throw new Error(`Unit ${lot.unitId} of fridge item ${lot.id} not found`);
    }
    return unit;
  }

  private async getLot(familyId: string, id: string): Promise<FridgeItem> {
    const item = await this.fridgeItems.findInFamily(id, familyId);
    if (!item) {
      throw this.lotNotFound();
    }
    return item;
  }

  private lotNotFound(): AppException {
    return AppException.notFound('Không tìm thấy lô thực phẩm trong kho của gia đình bạn.');
  }

  /** Reload lots with category/unit for the API response (distinct, in input order). */
  private async toResponses(familyId: string, lots: FridgeItem[]): Promise<FridgeItemResponse[]> {
    const ids = [...new Set(lots.map((lot) => lot.id))];
    const loaded = await this.fridgeItems.find({
      where: { id: In(ids), familyId },
      relations: { category: true, unit: true },
    });
    const byId = new Map(loaded.map((lot) => [lot.id, lot]));
    const today = this.clock.today();
    return ids.flatMap((id) => {
      const lot = byId.get(id);
      return lot ? [FridgeItemResponse.from(lot, today)] : [];
    });
  }

  private toChangeResponses(
    ledger: StockLedger,
    today: IsoDate,
    type: InventoryTransactionType,
  ): StockChangeResponse[] {
    const lots = new Map(ledger.lots().map((lot) => [lot.id, lot]));
    return ledger.changes().map((change) => {
      const lot = lots.get(change.fridgeItemId) as FridgeItem;
      return {
        ...change,
        name: lot.name,
        state: lot.getState(today, type),
      };
    });
  }
}
