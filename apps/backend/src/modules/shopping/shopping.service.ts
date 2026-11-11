import { PeriodType, type ShoppingItemChange, ShoppingListStatus } from '@dctl/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, type EntityManager, In } from 'typeorm';
import { BusinessClock } from '../../common/clock/business-clock';
import { AppException } from '../../common/exceptions/app.exception';
import { InvalidStateTransitionException } from '../../common/exceptions/domain.exceptions';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { Paged } from '../../common/interceptors/transform.interceptor';
import { addDays, type IsoDate } from '../../common/utils/date.util';
import { type FridgeItemInput } from '../fridge/fridge.types';
import { FridgeService } from '../fridge/fridge.service';
import {
  type CatalogItemInput,
  CatalogItemResolver,
  type ResolvedCatalogItem,
} from '../master-data/catalog-item.resolver';
import { UserRepository } from '../users/repositories/user.repository';
import {
  type AddShoppingItemDto,
  type AssignShoppingItemDto,
  type CompleteTripDto,
  CompleteTripResponse,
  type CreateShoppingListDto,
  type ItemVersionDto,
  type ListShoppingListsQueryDto,
  ShoppingItemResponse,
  ShoppingListDetailResponse,
  ShoppingListResponse,
  type TripItemOverrideDto,
  type UpdateShoppingItemDto,
  type UpdateShoppingListDto,
} from './dto/shopping.dto';
import { type ShoppingListItem } from './entities/shopping-list-item.entity';
import { type ShoppingList } from './entities/shopping-list.entity';
import {
  SHOPPING_ITEM_ADDED,
  SHOPPING_ITEM_REMOVED,
  SHOPPING_ITEM_UPDATED,
  SHOPPING_LIST_CREATED,
  SHOPPING_LIST_DELETED,
  SHOPPING_LIST_UPDATED,
  SHOPPING_TRIP_COMPLETED,
  ShoppingItemAddedEvent,
  ShoppingItemRemovedEvent,
  ShoppingItemUpdatedEvent,
  ShoppingListChangedEvent,
  ShoppingListDeletedEvent,
  ShoppingTripCompletedEvent,
} from './events';
import { ShoppingListItemRepository } from './repositories/shopping-list-item.repository';
import { ShoppingListRepository } from './repositories/shopping-list.repository';
import { type ItemCounts } from './shopping.types';

/** A WEEK list stays valid while its week (target_date … +6 days) is not over. */
const WEEK_LAST_DAY_OFFSET = 6;

/** Repositories bound to one transaction. */
interface Tx {
  lists: ShoppingListRepository;
  items: ShoppingListItemRepository;
  manager: EntityManager;
}

/** Locked list + item, ready for an item state change. */
interface LockedItem {
  list: ShoppingList;
  item: ShoppingListItem;
  tx: Tx;
}

/**
 * Điều phối danh sách mua sắm của gia đình (control, §10): lập danh sách, thêm/sửa/phân công
 * mặt hàng, đánh dấu đã mua, hoàn tất chuyến đi chợ → tự nhập kho (luồng 5.1).
 * - Mọi thay đổi chạy trong transaction, khoá dòng danh sách rồi mới tới mặt hàng.
 * - Mặt hàng dùng khoá lạc quan: client gửi `version` đã đọc; khác version hiện tại → 409
 *   VERSION_CONFLICT kèm bản mới nhất (NFR §9: không mất cập nhật khi nhiều người cùng sửa).
 * - Sự kiện domain phát SAU commit; ShoppingGateway chuyển thành realtime tới room gia đình.
 * - family_id luôn lấy từ phiên đăng nhập (BR-06).
 * @uc UC-SHOP-01, UC-SHOP-02, UC-SHOP-03  @fr FR-03, FR-04, FR-05, FR-06, FR-07, FR-08
 * @br BR-02, BR-04, BR-06
 */
@Injectable()
export class ShoppingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lists: ShoppingListRepository,
    private readonly items: ShoppingListItemRepository,
    private readonly users: UserRepository,
    private readonly catalog: CatalogItemResolver,
    private readonly fridgeService: FridgeService,
    private readonly clock: BusinessClock,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Lập danh sách mua sắm theo ngày/tuần (5.1 bước 1–2), có thể kèm mặt hàng ban đầu; phát
   * SHOPPING_LIST_CREATED để chia sẻ tới các thành viên.
   * @uc UC-SHOP-01  @fr FR-03, FR-04, FR-05, FR-06  @br BR-04, BR-06
   */
  async createList(
    familyId: string,
    actorId: string,
    dto: CreateShoppingListDto,
  ): Promise<ShoppingListDetailResponse> {
    const periodType = dto.periodType ?? PeriodType.Day;
    this.assertTargetDate(dto.targetDate, periodType);
    const inputs = dto.items ?? [];
    const resolved = await this.catalog.resolve(familyId, inputs.map(toCatalogInput));
    await this.assertMembers(
      familyId,
      inputs.flatMap((i) => (i.assigneeId ? [i.assigneeId] : [])),
    );

    const listId = await this.dataSource.transaction(async (manager) => {
      const { lists, items } = this.bind(manager);
      const list = await lists.save(
        lists.create({
          familyId,
          targetDate: dto.targetDate,
          periodType,
          status: ShoppingListStatus.Draft,
          createdBy: actorId,
        }),
      );
      await items.save(
        resolved.map((item, index) =>
          items.create({
            ...toItemFields(item),
            shoppingListId: list.id,
            expectedQuantity: inputs[index]?.expectedQuantity ?? 0,
            assigneeId: inputs[index]?.assigneeId ?? null,
          }),
        ),
      );
      return list.id;
    });

    const detail = await this.getList(familyId, listId);
    this.events.emit(
      SHOPPING_LIST_CREATED,
      new ShoppingListChangedEvent(familyId, toListSnapshot(detail), actorId),
    );
    return detail;
  }

  /**
   * Lịch sử danh sách của gia đình (lọc trạng thái, khoảng ngày), mới nhất trước.
   * @uc UC-SHOP-02  @fr FR-04, FR-21  @br BR-06
   */
  async listLists(
    familyId: string,
    query: ListShoppingListsQueryDto,
  ): Promise<Paged<ShoppingListResponse>> {
    const [lists, total] = await this.lists.listForFamily({
      familyId,
      status: query.status,
      from: query.from,
      to: query.to,
      offset: query.offset,
      limit: query.pageSize,
    });
    const counts = await this.items.countByLists(lists.map((l) => l.id));
    return new Paged(
      lists.map((list) => ShoppingListResponse.from(list, counts.get(list.id) ?? EMPTY_COUNTS)),
      { total, page: query.page, pageSize: query.pageSize },
    );
  }

  /**
   * Xem danh sách kèm mặt hàng, gom theo danh mục (FR-05). Danh sách của gia đình khác → 404.
   * @uc UC-SHOP-02  @fr FR-05, FR-06  @br BR-06
   */
  async getList(familyId: string, listId: string): Promise<ShoppingListDetailResponse> {
    const list = await this.findList(familyId, listId);
    const items = await this.items.findByList(list.id);
    const counts: ItemCounts = {
      total: items.length,
      purchased: items.filter((i) => i.isPurchased).length,
    };
    return Object.assign(
      new ShoppingListDetailResponse(),
      ShoppingListResponse.from(list, counts),
      {
        items: items.map((item) => ShoppingItemResponse.from(item)),
      },
    );
  }

  /**
   * Đổi ngày đi chợ / kỳ (ngày ↔ tuần) của danh sách chưa hoàn tất.
   * @uc UC-SHOP-01  @fr FR-04  @br BR-06
   */
  async updateList(
    familyId: string,
    actorId: string,
    listId: string,
    dto: UpdateShoppingListDto,
  ): Promise<ShoppingListResponse> {
    await this.dataSource.transaction(async (manager) => {
      const { lists } = this.bind(manager);
      const list = await this.lockList(lists, familyId, listId);
      list.assertEditable('UPDATE');
      const targetDate = dto.targetDate ?? list.targetDate;
      const periodType = dto.periodType ?? list.periodType;
      if (dto.targetDate !== undefined || dto.periodType !== undefined) {
        this.assertTargetDate(targetDate, periodType);
      }
      list.targetDate = targetDate;
      list.periodType = periodType;
      await lists.save(list);
    });
    const snapshot = await this.listSnapshot(familyId, listId);
    this.events.emit(
      SHOPPING_LIST_UPDATED,
      new ShoppingListChangedEvent(familyId, snapshot, actorId),
    );
    return snapshot;
  }

  /**
   * Xoá danh sách chưa hoàn tất (danh sách đã hoàn tất là lịch sử mua sắm — FR-21).
   * @uc UC-SHOP-01  @br BR-06
   */
  async deleteList(familyId: string, actorId: string, listId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const { lists } = this.bind(manager);
      const list = await this.lockList(lists, familyId, listId);
      list.assertEditable('DELETE');
      await lists.delete({ id: list.id });
    });
    this.events.emit(
      SHOPPING_LIST_DELETED,
      new ShoppingListDeletedEvent(familyId, listId, actorId),
    );
  }

  /**
   * Thêm một mặt hàng (chọn từ danh mục thực phẩm chuẩn hoặc tên tự do — BR-04), có thể phân
   * công thành viên (FR-03).
   * @uc UC-SHOP-01  @fr FR-03, FR-05, FR-06, FR-16  @br BR-04, BR-06
   */
  async addItem(
    familyId: string,
    actorId: string,
    listId: string,
    dto: AddShoppingItemDto,
  ): Promise<ShoppingItemResponse> {
    const [resolved] = await this.catalog.resolve(familyId, [toCatalogInput(dto)]);
    if (dto.assigneeId) {
      await this.assertMembers(familyId, [dto.assigneeId]);
    }
    const itemId = await this.dataSource.transaction(async (manager) => {
      const { lists, items } = this.bind(manager);
      const list = await this.lockList(lists, familyId, listId);
      list.assertEditable('ADD_ITEM');
      const item = await items.save(
        items.create({
          ...toItemFields(resolved),
          shoppingListId: list.id,
          expectedQuantity: dto.expectedQuantity,
          assigneeId: dto.assigneeId ?? null,
        }),
      );
      return item.id;
    });
    const item = await this.itemResponse(itemId);
    this.events.emit(SHOPPING_ITEM_ADDED, new ShoppingItemAddedEvent(familyId, item, actorId));
    return item;
  }

  /**
   * Sửa mặt hàng chưa mua (tên/thực phẩm, danh mục, số lượng, đơn vị) — khoá lạc quan.
   * @uc UC-SHOP-01  @fr FR-05, FR-07  @br BR-04, BR-06
   */
  async updateItem(
    familyId: string,
    actorId: string,
    listId: string,
    itemId: string,
    dto: UpdateShoppingItemDto,
  ): Promise<ShoppingItemResponse> {
    await this.dataSource.transaction(async (manager) => {
      const { item, tx } = await this.lockItem(manager, familyId, listId, itemId, 'EDIT_ITEM');
      await this.assertVersion(tx, item, dto.version);

      const referenceChanged =
        dto.foodId !== undefined ||
        dto.itemName !== undefined ||
        dto.categoryId !== undefined ||
        dto.unitId !== undefined;
      if (referenceChanged) {
        const identityChanged = dto.foodId !== undefined || dto.itemName !== undefined;
        const [resolved] = await this.catalog.resolve(familyId, [
          {
            foodId: dto.foodId !== undefined ? dto.foodId : identityChanged ? null : item.foodId,
            name: dto.itemName ?? (identityChanged ? null : item.itemName),
            categoryId: dto.categoryId ?? (dto.foodId ? null : item.categoryId),
            unitId: dto.unitId ?? item.unitId,
          },
        ]);
        item.edit(toItemFields(resolved));
      }
      if (dto.expectedQuantity !== undefined) {
        item.edit({ expectedQuantity: dto.expectedQuantity });
      }
      await tx.items.save(item);
    });
    return this.publishItemUpdate(familyId, actorId, itemId, 'edited');
  }

  /**
   * Xoá mặt hàng chưa mua khỏi danh sách chưa hoàn tất.
   * @uc UC-SHOP-01  @br BR-06
   */
  async removeItem(
    familyId: string,
    actorId: string,
    listId: string,
    itemId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const { item, tx } = await this.lockItem(manager, familyId, listId, itemId, 'REMOVE_ITEM');
      if (item.isPurchased) {
        throw new InvalidStateTransitionException(
          'ShoppingListItem',
          item.status,
          'REMOVE',
          'Không thể xoá mặt hàng đã mua. Hãy hoàn tác "đã mua" trước.',
        );
      }
      await tx.items.delete({ id: item.id });
    });
    this.events.emit(
      SHOPPING_ITEM_REMOVED,
      new ShoppingItemRemovedEvent(familyId, listId, itemId, actorId),
    );
  }

  /**
   * Phân công (hoặc bỏ phân công) thành viên mua một mặt hàng; người được phân công phải
   * thuộc cùng gia đình.
   * @uc UC-SHOP-01  @fr FR-03, FR-07  @br BR-06
   */
  async assignItem(
    familyId: string,
    actorId: string,
    listId: string,
    itemId: string,
    dto: AssignShoppingItemDto,
  ): Promise<ShoppingItemResponse> {
    if (dto.assigneeId !== null) {
      await this.assertMembers(familyId, [dto.assigneeId]);
    }
    const previousAssigneeId = await this.dataSource.transaction(async (manager) => {
      const { item, tx } = await this.lockItem(manager, familyId, listId, itemId, 'ASSIGN');
      await this.assertVersion(tx, item, dto.version);
      const previous = item.assigneeId;
      item.assignTo(dto.assigneeId);
      await tx.items.save(item);
      return previous;
    });
    return this.publishItemUpdate(familyId, actorId, itemId, 'assigned', previousAssigneeId);
  }

  /**
   * Đánh dấu "Đã mua" bằng một thao tác (5.1 bước 3–4). Mặt hàng đầu tiên được mua chuyển
   * danh sách Nháp → Đang mua. Đồng bộ cho cả nhóm qua realtime (NFR §9: < 2 s).
   * @uc UC-SHOP-03  @fr FR-07  @br BR-06
   */
  async markAsPurchased(
    familyId: string,
    actorId: string,
    listId: string,
    itemId: string,
    dto: ItemVersionDto,
  ): Promise<ShoppingItemResponse> {
    const listStarted = await this.dataSource.transaction(async (manager) => {
      const { list, item, tx } = await this.lockItem(manager, familyId, listId, itemId, 'PURCHASE');
      await this.assertVersion(tx, item, dto.version);
      item.markAsPurchased(actorId, this.clock.now());
      await tx.items.save(item);
      const started = list.ensureShopping();
      if (started) {
        await tx.lists.save(list);
      }
      return started;
    });
    const item = await this.publishItemUpdate(familyId, actorId, itemId, 'purchased');
    if (listStarted) {
      this.events.emit(
        SHOPPING_LIST_UPDATED,
        new ShoppingListChangedEvent(familyId, await this.listSnapshot(familyId, listId), actorId),
      );
    }
    return item;
  }

  /**
   * Hoàn tác "Đã mua" khi bấm nhầm (Đã mua → Chưa mua), chỉ khi danh sách chưa hoàn tất.
   * Danh sách giữ trạng thái Đang mua (máy trạng thái không có Đang mua → Nháp).
   * @uc UC-SHOP-03  @fr FR-07  @br BR-06
   */
  async unmarkPurchased(
    familyId: string,
    actorId: string,
    listId: string,
    itemId: string,
    dto: ItemVersionDto,
  ): Promise<ShoppingItemResponse> {
    await this.dataSource.transaction(async (manager) => {
      const { item, tx } = await this.lockItem(manager, familyId, listId, itemId, 'UNPURCHASE');
      await this.assertVersion(tx, item, dto.version);
      item.unmarkPurchased();
      await tx.items.save(item);
    });
    return this.publishItemUpdate(familyId, actorId, itemId, 'unpurchased');
  }

  /**
   * "Hoàn tất chuyến đi chợ" (5.1 bước 5–8), trong MỘT transaction:
   * khoá danh sách → quét mặt hàng đã mua (BR-02: chỉ mục is_purchased) → chuyển thành lô
   * nhập kho (số lượng/hạn/vị trí/giá có thể điều chỉnh; hạn mặc định theo danh mục) →
   * FridgeService.addItems() → danh sách Đang mua → Hoàn tất. Sau commit phát
   * SHOPPING_TRIP_COMPLETED và FRIDGE_ITEMS_ADDED. Mặt hàng chưa mua giữ lại làm lịch sử.
   * @uc UC-SHOP-03, UC-FRIDGE-01  @fr FR-07, FR-08, FR-09  @br BR-02, BR-06
   */
  async completeTrip(
    familyId: string,
    actorId: string,
    listId: string,
    dto: CompleteTripDto,
  ): Promise<CompleteTripResponse> {
    const overrides = dto.items ?? [];
    this.assertOverrideDates(overrides);
    const overrideById = new Map(overrides.map((o) => [o.itemId, o]));

    const outcome = await this.dataSource.transaction(async (manager) => {
      const { lists, items } = this.bind(manager);
      const list = await this.lockList(lists, familyId, listId);
      list.assertEditable('COMPLETE');

      const purchased = await items.findPurchased(list.id);
      if (purchased.length === 0) {
        throw new AppException(ErrorCode.NothingPurchased, undefined, HttpStatus.CONFLICT);
      }
      const purchasedIds = new Set(purchased.map((i) => i.id));
      const unknown = overrides
        .map((o, index) => ({ o, index }))
        .filter(({ o }) => !purchasedIds.has(o.itemId));
      if (unknown.length > 0) {
        throw AppException.validation(
          unknown.map(({ index }) => ({
            field: `items.${index}.itemId`,
            constraints: {
              purchased: 'Mặt hàng không thuộc danh sách hoặc chưa được đánh dấu đã mua.',
            },
          })),
        );
      }

      list.complete();
      const inputs: FridgeItemInput[] = purchased.map((item) => {
        const override = overrideById.get(item.id);
        return {
          foodId: item.foodId,
          name: item.itemName,
          categoryId: item.categoryId,
          unitId: item.unitId,
          quantity: override?.quantity ?? item.expectedQuantity,
          expiryDate: override?.expiryDate ?? null,
          storageLocation: override?.storageLocation,
          purchasedPrice: override?.purchasedPrice ?? null,
        };
      });
      const fridge = await this.fridgeService.addItems(inputs, {
        familyId,
        actorId,
        source: 'shopping-trip',
        manager,
      });
      await lists.save(list);
      const pendingItemCount = await items.countBy({
        shoppingListId: list.id,
        isPurchased: false,
      });
      return { fridge, importedItemIds: purchased.map((i) => i.id), pendingItemCount };
    });

    this.fridgeService.publishItemsAdded(outcome.fridge);
    const snapshot = await this.listSnapshot(familyId, listId);
    const response = Object.assign(new CompleteTripResponse(), {
      list: snapshot,
      importedItemIds: outcome.importedItemIds,
      fridgeItemIds: outcome.fridge.event.fridgeItemIds,
      pendingItemCount: outcome.pendingItemCount,
    });
    this.events.emit(
      SHOPPING_TRIP_COMPLETED,
      new ShoppingTripCompletedEvent(
        familyId,
        snapshot,
        response.importedItemIds,
        response.fridgeItemIds,
        response.pendingItemCount,
        actorId,
      ),
    );
    return response;
  }

  private bind(manager: EntityManager): Tx {
    return {
      lists: this.lists.withManager(manager),
      items: this.items.withManager(manager),
      manager,
    };
  }

  private async findList(familyId: string, listId: string): Promise<ShoppingList> {
    const list = await this.lists.findInFamily(listId, familyId);
    if (!list) {
      throw listNotFound();
    }
    return list;
  }

  private async lockList(
    lists: ShoppingListRepository,
    familyId: string,
    listId: string,
  ): Promise<ShoppingList> {
    const list = await lists.lockInFamily(listId, familyId);
    if (!list) {
      throw listNotFound();
    }
    return list;
  }

  /** Lock list then item (fixed order), and refuse changes on a completed list. */
  private async lockItem(
    manager: EntityManager,
    familyId: string,
    listId: string,
    itemId: string,
    action: string,
  ): Promise<LockedItem> {
    const tx = this.bind(manager);
    const list = await this.lockList(tx.lists, familyId, listId);
    list.assertEditable(action);
    const item = await tx.items.lockInList(itemId, list.id);
    if (!item) {
      throw AppException.notFound('Không tìm thấy mặt hàng trong danh sách.');
    }
    return { list, item, tx };
  }

  /** Optimistic lock check; the conflict carries the current item so the app can refresh. */
  private async assertVersion(tx: Tx, item: ShoppingListItem, expected: number): Promise<void> {
    if (item.version === expected) {
      return;
    }
    const current = await tx.items.findWithRelations(item.id);
    throw new AppException(ErrorCode.VersionConflict, undefined, HttpStatus.CONFLICT, {
      expectedVersion: expected,
      currentVersion: item.version,
      current: current ? ShoppingItemResponse.from(current) : null,
    });
  }

  /** BR-06: assignees must belong to the caller's family. */
  private async assertMembers(familyId: string, userIds: readonly string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) {
      return;
    }
    const members = await this.users.findBy({ id: In(ids), familyId });
    const found = new Set(members.map((m) => m.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new AppException(ErrorCode.MemberNotFound, undefined, HttpStatus.NOT_FOUND, {
        userIds: missing,
      });
    }
  }

  /** DAY: not before today. WEEK: the week (target … +6) must not be over yet. @fr FR-04 */
  private assertTargetDate(targetDate: IsoDate, periodType: PeriodType): void {
    const today = this.clock.today();
    const lastDay =
      periodType === PeriodType.Week ? addDays(targetDate, WEEK_LAST_DAY_OFFSET) : targetDate;
    if (lastDay < today) {
      throw AppException.validation([
        {
          field: 'targetDate',
          constraints: {
            notPast:
              periodType === PeriodType.Week
                ? 'Tuần đi chợ đã kết thúc.'
                : 'Ngày đi chợ không được trước hôm nay.',
          },
        },
      ]);
    }
  }

  /** Expiry overrides must not be in the past (BR-02). */
  private assertOverrideDates(overrides: readonly TripItemOverrideDto[]): void {
    const today = this.clock.today();
    const errors = overrides.flatMap((o, index) =>
      o.expiryDate !== undefined && o.expiryDate < today
        ? [
            {
              field: `items.${index}.expiryDate`,
              constraints: { notPast: 'Hạn dùng không được trước hôm nay.' },
            },
          ]
        : [],
    );
    if (errors.length > 0) {
      throw AppException.validation(errors);
    }
  }

  private async itemResponse(itemId: string): Promise<ShoppingItemResponse> {
    const item = await this.items.findWithRelations(itemId);
    if (!item) {
      throw AppException.notFound('Không tìm thấy mặt hàng trong danh sách.');
    }
    return ShoppingItemResponse.from(item);
  }

  private async listSnapshot(familyId: string, listId: string): Promise<ShoppingListResponse> {
    const list = await this.findList(familyId, listId);
    const counts = await this.items.countByLists([list.id]);
    return ShoppingListResponse.from(list, counts.get(list.id) ?? EMPTY_COUNTS);
  }

  private async publishItemUpdate(
    familyId: string,
    actorId: string,
    itemId: string,
    change: ShoppingItemChange,
    previousAssigneeId: string | null = null,
  ): Promise<ShoppingItemResponse> {
    const item = await this.itemResponse(itemId);
    this.events.emit(
      SHOPPING_ITEM_UPDATED,
      new ShoppingItemUpdatedEvent(familyId, item, change, actorId, previousAssigneeId),
    );
    return item;
  }
}

const EMPTY_COUNTS: ItemCounts = { total: 0, purchased: 0 };

function listNotFound(): AppException {
  return AppException.notFound('Không tìm thấy danh sách mua sắm của gia đình bạn.');
}

function toCatalogInput(dto: AddShoppingItemDto): CatalogItemInput {
  return {
    foodId: dto.foodId ?? null,
    name: dto.itemName ?? null,
    categoryId: dto.categoryId ?? null,
    unitId: dto.unitId,
  };
}

function toItemFields(item: ResolvedCatalogItem): {
  foodId: string | null;
  itemName: string;
  categoryId: string;
  unitId: string;
} {
  return {
    foodId: item.foodId,
    itemName: item.name,
    categoryId: item.categoryId,
    unitId: item.unitId,
  };
}

/** Strip the items of a detail response (realtime payloads carry the list only). */
function toListSnapshot(detail: ShoppingListDetailResponse): ShoppingListResponse {
  return Object.assign(new ShoppingListResponse(), {
    id: detail.id,
    targetDate: detail.targetDate,
    periodType: detail.periodType,
    status: detail.status,
    createdBy: detail.createdBy,
    itemCount: detail.itemCount,
    purchasedCount: detail.purchasedCount,
    updatedAt: detail.updatedAt,
  });
}
