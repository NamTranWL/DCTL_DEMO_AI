/**
 * e2e (B7): luồng 5.1 "Danh sách mua sắm & tự nhập kho" từ API → DB → realtime, rồi kho
 * (UC-FRIDGE-01..03) trên PostgreSQL + Redis thật (cần seed: danh mục, đơn vị, thực phẩm).
 *
 *   Gia đình A: homemakerA (chủ, HOMEMAKER) + memberA (MEMBER) — hai socket cùng room
 *   Gia đình B: homemakerB — socket riêng, không bao giờ nhận sự kiện của A (BR-06)
 *
 * 1. [Nội trợ] tạo danh sách → [Hệ thống] lưu DB, broadcast `shopping:list-created`
 * 2–4. [Thành viên] đánh dấu "Đã mua" → PURCHASED, danh sách DRAFT → SHOPPING, cả nhóm thấy
 * 5–8. [Thành viên] "Hoàn tất chuyến đi chợ" → chỉ mục đã mua vào kho, hạn mặc định theo danh
 *      mục (BR-02), inventory_transactions ADD, `shopping:trip-completed` + `fridge:items-changed`
 * Kho: tra cứu không dấu, trừ FEFO bỏ qua lô hết hạn, không âm (BR-03), huỷ = lãng phí (BR-05).
 */
import {
  FridgeItemState,
  InventoryTransactionType,
  REALTIME_EVENTS,
  type RealtimeEventName,
  type RealtimeEventPayloads,
  ShoppingListItemStatus,
  ShoppingListStatus,
  StorageLocation,
} from '@dctl/shared';
import { type INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { ErrorCode } from '../src/common/exceptions/error-code.enum';
import { BusinessClock } from '../src/common/clock/business-clock';
import { addDays } from '../src/common/utils/date.util';
import { Family } from '../src/modules/families/entities/family.entity';
import { FridgeItem } from '../src/modules/fridge/entities/fridge-item.entity';
import { InventoryTransaction } from '../src/modules/fridge/entities/inventory-transaction.entity';
import { Category } from '../src/modules/master-data/entities/category.entity';
import { Food } from '../src/modules/master-data/entities/food.entity';
import { Unit } from '../src/modules/master-data/entities/unit.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createTestApp, listenOnRandomPort, uniqueSuffix } from './helpers/test-app';

const PASSWORD = 'Test@1234';
const SILENCE_MS = 400;

interface Session {
  id: string;
  token: string;
}
interface ItemBody {
  id: string;
  shoppingListId: string;
  foodId: string | null;
  itemName: string;
  categoryName: string | null;
  expectedQuantity: number;
  status: ShoppingListItemStatus;
  isPurchased: boolean;
  assigneeId: string | null;
  purchasedBy: string | null;
  version: number;
}
interface ListBody {
  id: string;
  status: ShoppingListStatus;
  itemCount: number;
  purchasedCount: number;
  items: ItemBody[];
}
interface FridgeBody {
  id: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unitSymbol: string | null;
  expiryDate: string;
  state: FridgeItemState;
  storageLocation: StorageLocation;
  storageAdvice: string | null;
}
interface ChangeBody {
  fridgeItemId: string;
  quantity: number;
  remaining: number;
  state: FridgeItemState;
}
interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Records every event a socket receives, so tests can wait for or rule out an event. */
class Recorder {
  readonly events: { name: string; payload: unknown }[] = [];

  constructor(readonly socket: Socket) {
    socket.onAny((name: string, payload: unknown) => this.events.push({ name, payload }));
  }

  async next<E extends RealtimeEventName>(
    event: E,
    match: (payload: RealtimeEventPayloads[E]) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<RealtimeEventPayloads[E]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.events.find(
        (e) => e.name === event && match(e.payload as RealtimeEventPayloads[E]),
      );
      if (found) {
        return found.payload as RealtimeEventPayloads[E];
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`timeout waiting for ${event}`);
  }

  names(): string[] {
    return this.events.map((e) => e.name);
  }

  clear(): void {
    this.events.length = 0;
  }
}

describe('Shopping → fridge flow 5.1 (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  let today: string;
  const suffix = uniqueSuffix();
  const usernames: string[] = [];
  const familyIds: string[] = [];
  const sockets: Socket[] = [];

  let homemakerA: Session;
  let memberA: Session;
  let homemakerB: Session;
  let rtHomemakerA: Recorder;
  let rtMemberA: Recorder;
  let rtB: Recorder;

  let tomato: Food; // Củ quả, 7 ngày
  let pork: Food; // Thịt, 2 ngày
  let dryCategory: Category;
  let kg: Unit;
  let g: Unit;
  let pack: Unit;

  const http = () => request(app.getHttpServer());
  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
  const data = <T>(res: request.Response): T => (res.body as { data: T }).data;
  const error = (res: request.Response): ErrorBody => res.body as ErrorBody;

  async function register(name: string): Promise<Session> {
    const username = `${name}_${suffix}`.toLowerCase();
    usernames.push(username);
    const res = await http()
      .post('/api/auth/register')
      .send({ username, email: `${username}@e2e.test`, password: PASSWORD })
      .expect(201);
    const body = data<{ accessToken: string; user: { id: string } }>(res);
    return { id: body.user.id, token: body.accessToken };
  }

  async function createFamily(owner: Session, name: string): Promise<string> {
    const res = await http().post('/api/families').set(auth(owner)).send({ name }).expect(201);
    const family = data<{ id: string; inviteCode: string }>(res);
    familyIds.push(family.id);
    return family.inviteCode;
  }

  function connect(session: Session): Promise<Recorder> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/realtime`, {
        auth: { token: session.token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      const recorder = new Recorder(socket);
      socket.once(REALTIME_EVENTS.SYSTEM_READY, () => resolve(recorder));
      socket.once('connect_error', reject);
    });
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, SILENCE_MS));

  async function getList(session: Session, listId: string): Promise<ListBody> {
    const res = await http().get(`/api/shopping-lists/${listId}`).set(auth(session)).expect(200);
    return data<ListBody>(res);
  }

  function itemOf(list: ListBody, name: string): ItemBody {
    const item = list.items.find((i) => i.itemName === name);
    if (!item) {
      throw new Error(`item ${name} not in list`);
    }
    return item;
  }

  async function fridgeLots(familyOwner: Session, query: Record<string, string> = {}) {
    const res = await http()
      .get('/api/fridge/items')
      .query({ pageSize: 100, ...query })
      .set(auth(familyOwner))
      .expect(200);
    return data<FridgeBody[]>(res);
  }

  beforeAll(async () => {
    app = await createTestApp();
    baseUrl = await listenOnRandomPort(app);
    ds = app.get(DataSource);
    today = app.get(BusinessClock).today();

    const foods = await ds.getRepository(Food).findBy({ name: In(['Cà chua', 'Thịt ba chỉ']) });
    tomato = foods.find((f) => f.name === 'Cà chua') as Food;
    pork = foods.find((f) => f.name === 'Thịt ba chỉ') as Food;
    dryCategory = await ds.getRepository(Category).findOneByOrFail({ name: 'Ngũ cốc và đồ khô' });
    const units = await ds.getRepository(Unit).findBy({ symbol: In(['kg', 'g', 'gói']) });
    kg = units.find((u) => u.symbol === 'kg') as Unit;
    g = units.find((u) => u.symbol === 'g') as Unit;
    pack = units.find((u) => u.symbol === 'gói') as Unit;

    homemakerA = await register('shopHomeA');
    const inviteA = await createFamily(homemakerA, `Nhà A ${suffix}`);
    memberA = await register('shopMemberA');
    await http()
      .post('/api/families/join')
      .set(auth(memberA))
      .send({ inviteCode: inviteA })
      .expect(200);
    homemakerB = await register('shopHomeB');
    await createFamily(homemakerB, `Nhà B ${suffix}`);

    rtHomemakerA = await connect(homemakerA);
    rtMemberA = await connect(memberA);
    rtB = await connect(homemakerB);
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    if (familyIds.length) {
      await ds.getRepository(Family).delete({ id: In(familyIds) });
    }
    if (usernames.length) {
      await ds.getRepository(User).delete({ username: In(usernames) });
    }
    await app.close();
  });

  describe('luồng 5.1', () => {
    let listId: string;

    it('1–2. người nội trợ lập danh sách → lưu DB và chia sẻ realtime cho gia đình A', async () => {
      const res = await http()
        .post('/api/shopping-lists')
        .set(auth(homemakerA))
        .send({
          targetDate: today,
          periodType: 'DAY',
          items: [
            { foodId: tomato.id, expectedQuantity: 1, unitId: kg.id },
            { foodId: pork.id, expectedQuantity: 500, unitId: g.id, assigneeId: memberA.id },
            {
              itemName: '  bánh   mì gối  ',
              categoryId: dryCategory.id,
              expectedQuantity: 1,
              unitId: pack.id,
            },
          ],
        })
        .expect(201);
      const list = data<ListBody>(res);
      listId = list.id;

      expect(list).toMatchObject({ status: ShoppingListStatus.Draft, itemCount: 3 });
      expect(itemOf(list, 'Cà chua')).toMatchObject({
        foodId: tomato.id,
        status: ShoppingListItemStatus.Pending,
        version: 1,
      });
      expect(itemOf(list, 'Thịt ba chỉ').assigneeId).toBe(memberA.id);
      // Tên tự do được chuẩn hoá (BR-04), không có food_id.
      expect(itemOf(list, 'Bánh mì gối').foodId).toBeNull();

      const shared = await rtMemberA.next(
        REALTIME_EVENTS.SHOPPING_LIST_CREATED,
        (p) => p.list.id === listId,
      );
      expect(shared).toMatchObject({ actorId: homemakerA.id, list: { itemCount: 3 } });
      await settle();
      expect(rtB.names()).not.toContain(REALTIME_EVENTS.SHOPPING_LIST_CREATED);
    });

    it('thành viên xem được danh sách nhưng không lập/sửa được (đúng actor UC)', async () => {
      const list = await getList(memberA, listId);
      expect(list.items.map((i) => i.categoryName)).toEqual(
        [...list.items.map((i) => i.categoryName)].sort((a, b) => (a ?? '').localeCompare(b ?? '')),
      );

      const create = await http()
        .post('/api/shopping-lists')
        .set(auth(memberA))
        .send({ targetDate: today })
        .expect(403);
      expect(error(create).code).toBe(ErrorCode.Forbidden);
      await http()
        .post(`/api/shopping-lists/${listId}/items`)
        .set(auth(memberA))
        .send({ foodId: tomato.id, expectedQuantity: 1, unitId: kg.id })
        .expect(403);
    });

    it('gia đình B không thấy, không sửa được danh sách của A (404, BR-06)', async () => {
      const list = await getList(homemakerA, listId);
      await http().get(`/api/shopping-lists/${listId}`).set(auth(homemakerB)).expect(404);
      await http()
        .post(`/api/shopping-lists/${listId}/items/${itemOf(list, 'Cà chua').id}/purchase`)
        .set(auth(homemakerB))
        .send({ version: 1 })
        .expect(404);
      const lists = await http().get('/api/shopping-lists').set(auth(homemakerB)).expect(200);
      expect(data<{ id: string }[]>(lists).map((l) => l.id)).not.toContain(listId);
    });

    it('3–4. thành viên đánh dấu "Đã mua" → PURCHASED, danh sách DRAFT → SHOPPING, cả nhóm thấy', async () => {
      rtHomemakerA.clear();
      const tomatoItem = itemOf(await getList(memberA, listId), 'Cà chua');
      const res = await http()
        .post(`/api/shopping-lists/${listId}/items/${tomatoItem.id}/purchase`)
        .set(auth(memberA))
        .send({ version: tomatoItem.version })
        .expect(200);
      expect(data<ItemBody>(res)).toMatchObject({
        status: ShoppingListItemStatus.Purchased,
        purchasedBy: memberA.id,
        version: tomatoItem.version + 1,
      });

      const update = await rtHomemakerA.next(
        REALTIME_EVENTS.SHOPPING_ITEM_UPDATED,
        (p) => p.item.id === tomatoItem.id,
      );
      expect(update).toMatchObject({ change: 'purchased', actorId: memberA.id });
      const listUpdate = await rtHomemakerA.next(REALTIME_EVENTS.SHOPPING_LIST_UPDATED);
      expect(listUpdate.list).toMatchObject({
        status: ShoppingListStatus.Shopping,
        purchasedCount: 1,
      });
      await settle();
      expect(rtB.names()).not.toContain(REALTIME_EVENTS.SHOPPING_ITEM_UPDATED);
    });

    it('xung đột: sửa bằng version cũ → 409 VERSION_CONFLICT kèm bản mới nhất', async () => {
      const tomatoItem = itemOf(await getList(homemakerA, listId), 'Cà chua');
      const res = await http()
        .post(`/api/shopping-lists/${listId}/items/${tomatoItem.id}/unpurchase`)
        .set(auth(homemakerA))
        .send({ version: tomatoItem.version - 1 })
        .expect(409);
      expect(error(res)).toMatchObject({
        code: ErrorCode.VersionConflict,
        details: {
          expectedVersion: tomatoItem.version - 1,
          currentVersion: tomatoItem.version,
          current: { id: tomatoItem.id, status: ShoppingListItemStatus.Purchased },
        },
      });
    });

    it('xung đột: hai người cùng đánh dấu một mặt hàng với cùng version → một 200, một 409', async () => {
      const porkItem = itemOf(await getList(homemakerA, listId), 'Thịt ba chỉ');
      const send = (s: Session) =>
        http()
          .post(`/api/shopping-lists/${listId}/items/${porkItem.id}/purchase`)
          .set(auth(s))
          .send({ version: porkItem.version });
      const results = await Promise.all([send(homemakerA), send(memberA)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const conflict = results.find((r) => r.status === 409) as request.Response;
      expect(error(conflict).code).toBe(ErrorCode.VersionConflict);
      expect(itemOf(await getList(homemakerA, listId), 'Thịt ba chỉ').version).toBe(
        porkItem.version + 1,
      );
    });

    it('hoàn tác "Đã mua" (bấm nhầm) khi danh sách chưa hoàn tất', async () => {
      const bread = itemOf(await getList(memberA, listId), 'Bánh mì gối');
      const marked = await http()
        .post(`/api/shopping-lists/${listId}/items/${bread.id}/purchase`)
        .set(auth(memberA))
        .send({ version: bread.version })
        .expect(200);
      const undone = await http()
        .post(`/api/shopping-lists/${listId}/items/${bread.id}/unpurchase`)
        .set(auth(memberA))
        .send({ version: data<ItemBody>(marked).version })
        .expect(200);
      expect(data<ItemBody>(undone)).toMatchObject({
        status: ShoppingListItemStatus.Pending,
        purchasedBy: null,
      });
      await rtHomemakerA.next(
        REALTIME_EVENTS.SHOPPING_ITEM_UPDATED,
        (p) => p.item.id === bread.id && p.change === 'unpurchased',
      );
    });

    it('5–8. hoàn tất chuyến đi chợ → chỉ mục đã mua vào kho, hạn mặc định theo danh mục', async () => {
      rtHomemakerA.clear();
      rtB.clear();
      const list = await getList(memberA, listId);
      const tomatoItem = itemOf(list, 'Cà chua');
      const porkItem = itemOf(list, 'Thịt ba chỉ');

      const res = await http()
        .post(`/api/shopping-lists/${listId}/complete`)
        .set(auth(memberA))
        .send({
          items: [
            {
              itemId: tomatoItem.id,
              quantity: 1.2,
              expiryDate: addDays(today, 5),
              purchasedPrice: 30000,
            },
          ],
        })
        .expect(200);
      const result = data<{
        list: { status: ShoppingListStatus };
        importedItemIds: string[];
        fridgeItemIds: string[];
        pendingItemCount: number;
      }>(res);
      expect(result.list.status).toBe(ShoppingListStatus.Completed);
      expect(result.importedItemIds.sort()).toEqual([tomatoItem.id, porkItem.id].sort());
      expect(result.pendingItemCount).toBe(1);
      expect(result.fridgeItemIds).toHaveLength(2);

      // DB: 2 lô mới trong kho của gia đình A, giao dịch ADD do thành viên thực hiện.
      const lots = await ds.getRepository(FridgeItem).findBy({ id: In(result.fridgeItemIds) });
      const tomatoLot = lots.find((l) => l.foodId === tomato.id) as FridgeItem;
      const porkLot = lots.find((l) => l.foodId === pork.id) as FridgeItem;
      expect(tomatoLot).toMatchObject({
        quantity: 1.2,
        expiryDate: addDays(today, 5),
        storageLocation: StorageLocation.Fridge,
        purchasedPrice: 30000,
      });
      // BR-02: Thịt có hạn mặc định 2 ngày.
      expect(porkLot).toMatchObject({ quantity: 500, expiryDate: addDays(today, 2) });
      const adds = await ds
        .getRepository(InventoryTransaction)
        .findBy({ fridgeItemId: In(result.fridgeItemIds) });
      expect(adds).toHaveLength(2);
      expect(adds.every((t) => t.type === InventoryTransactionType.Add)).toBe(true);
      expect(adds.every((t) => t.userId === memberA.id)).toBe(true);

      const completed = await rtHomemakerA.next(REALTIME_EVENTS.SHOPPING_TRIP_COMPLETED);
      expect(completed).toMatchObject({ actorId: memberA.id, pendingItemCount: 1 });
      const fridgeChanged = await rtHomemakerA.next(REALTIME_EVENTS.FRIDGE_ITEMS_CHANGED);
      expect(fridgeChanged).toMatchObject({ reason: 'added', source: 'shopping-trip' });
      await settle();
      expect(rtB.names()).toEqual([]);
    });

    it('danh sách đã hoàn tất không thay đổi được nữa (409)', async () => {
      const bread = itemOf(await getList(memberA, listId), 'Bánh mì gối');
      const purchase = await http()
        .post(`/api/shopping-lists/${listId}/items/${bread.id}/purchase`)
        .set(auth(memberA))
        .send({ version: bread.version })
        .expect(409);
      expect(error(purchase).code).toBe(ErrorCode.InvalidStateTransition);
      await http()
        .post(`/api/shopping-lists/${listId}/complete`)
        .set(auth(memberA))
        .send({})
        .expect(409);
      await http().delete(`/api/shopping-lists/${listId}`).set(auth(homemakerA)).expect(409);
    });
  });

  describe('quy tắc danh sách', () => {
    it('ngày đi chợ: hôm qua → 400; tuần bắt đầu 6 ngày trước vẫn hợp lệ (BVA)', async () => {
      const past = await http()
        .post('/api/shopping-lists')
        .set(auth(homemakerA))
        .send({ targetDate: addDays(today, -1) })
        .expect(400);
      expect(error(past).details).toEqual([
        expect.objectContaining({ field: 'targetDate' }) as unknown,
      ]);
      await http()
        .post('/api/shopping-lists')
        .set(auth(homemakerA))
        .send({ targetDate: addDays(today, -6), periodType: 'WEEK' })
        .expect(201);
      await http()
        .post('/api/shopping-lists')
        .set(auth(homemakerA))
        .send({ targetDate: addDays(today, -7), periodType: 'WEEK' })
        .expect(400);
    });

    it('hoàn tất khi chưa mua gì → 409; số lượng 0 → 400; client không gửi được familyId', async () => {
      const created = await http()
        .post('/api/shopping-lists')
        .set(auth(homemakerA))
        .send({ targetDate: today })
        .expect(201);
      const listId = data<ListBody>(created).id;
      await http()
        .post(`/api/shopping-lists/${listId}/items`)
        .set(auth(homemakerA))
        .send({ foodId: tomato.id, expectedQuantity: 0, unitId: kg.id })
        .expect(400);
      await http()
        .post(`/api/shopping-lists/${listId}/items`)
        .set(auth(homemakerA))
        .send({ foodId: tomato.id, expectedQuantity: 0.001, unitId: kg.id })
        .expect(201);
      const nothing = await http()
        .post(`/api/shopping-lists/${listId}/complete`)
        .set(auth(memberA))
        .send({})
        .expect(409);
      expect(error(nothing).code).toBe(ErrorCode.NothingPurchased);
      await http()
        .post('/api/shopping-lists')
        .set(auth(homemakerA))
        .send({ targetDate: today, familyId: familyIds[1] })
        .expect(400);
    });

    it('phân công cho người ngoài gia đình → 404', async () => {
      const created = await http()
        .post('/api/shopping-lists')
        .set(auth(homemakerA))
        .send({
          targetDate: today,
          items: [{ foodId: tomato.id, expectedQuantity: 1, unitId: kg.id }],
        })
        .expect(201);
      const list = data<ListBody>(created);
      const item = itemOf(list, 'Cà chua');
      const res = await http()
        .put(`/api/shopping-lists/${list.id}/items/${item.id}/assignee`)
        .set(auth(homemakerA))
        .send({ assigneeId: homemakerB.id, version: item.version })
        .expect(404);
      expect(error(res).code).toBe(ErrorCode.MemberNotFound);
      const ok = await http()
        .put(`/api/shopping-lists/${list.id}/items/${item.id}/assignee`)
        .set(auth(homemakerA))
        .send({ assigneeId: memberA.id, version: item.version })
        .expect(200);
      expect(data<ItemBody>(ok)).toMatchObject({ assigneeId: memberA.id, version: 2 });
    });
  });

  describe('kho (UC-FRIDGE-01..03)', () => {
    let freshTomatoId: string;
    let soonTomatoId: string;
    let expiredTomatoId: string;

    it('nhập kho thủ công: hạn mặc định theo danh mục, gộp lô trùng; thành viên → 403', async () => {
      const res = await http()
        .post('/api/fridge/items')
        .set(auth(homemakerA))
        .send({
          items: [
            { foodId: tomato.id, quantity: 0.5, unitId: kg.id, expiryDate: addDays(today, 2) },
            { foodId: tomato.id, quantity: 0.3, unitId: kg.id, expiryDate: today },
            { foodId: tomato.id, quantity: 0.2, unitId: kg.id, expiryDate: addDays(today, 2) },
          ],
        })
        .expect(201);
      const lots = data<FridgeBody[]>(res);
      // Dòng 1 và 3 cùng thực phẩm/đơn vị/hạn/vị trí → một lô 0.7 kg.
      expect(lots).toHaveLength(2);
      const soon = lots.find((l) => l.expiryDate === addDays(today, 2)) as FridgeBody;
      const expired = lots.find((l) => l.expiryDate === today) as FridgeBody;
      expect(soon).toMatchObject({ quantity: 0.7, state: FridgeItemState.ExpiringSoon });
      expect(expired.state).toBe(FridgeItemState.Expired);
      soonTomatoId = soon.id;
      expiredTomatoId = expired.id;

      const fresh = (await fridgeLots(homemakerA, { foodId: tomato.id })).find(
        (l) => l.expiryDate === addDays(today, 5),
      ) as FridgeBody;
      freshTomatoId = fresh.id;

      await http()
        .post('/api/fridge/items')
        .set(auth(memberA))
        .send({ items: [{ foodId: tomato.id, quantity: 1, unitId: kg.id }] })
        .expect(403);
      const past = await http()
        .post('/api/fridge/items')
        .set(auth(homemakerA))
        .send({
          items: [
            { foodId: tomato.id, quantity: 1, unitId: kg.id, expiryDate: addDays(today, -1) },
          ],
        })
        .expect(400);
      expect(error(past).details).toEqual([
        expect.objectContaining({ field: 'items.0.expiryDate' }) as unknown,
      ]);
    });

    it('tra cứu không dấu theo tên, lọc trạng thái; kèm gợi ý bảo quản (FR-11, FR-12)', async () => {
      const byName = await fridgeLots(homemakerA, { q: 'CA CHUA' });
      expect(byName.map((l) => l.id).sort()).toEqual(
        [freshTomatoId, soonTomatoId, expiredTomatoId].sort(),
      );
      // Hạn sớm nhất trước (FEFO).
      expect(byName[0]?.id).toBe(expiredTomatoId);
      expect(byName[0]?.storageAdvice).toEqual(expect.any(String));

      const expired = await fridgeLots(homemakerA, { state: FridgeItemState.Expired });
      expect(expired.map((l) => l.id)).toEqual([expiredTomatoId]);
      const memberView = await fridgeLots(memberA, { q: 'thit' });
      expect(memberView.map((l) => l.foodId)).toEqual([pork.id]);
    });

    it('ghi nhận sử dụng theo FEFO: bỏ qua lô hết hạn, lô hạn sớm trước, quy đổi g → kg', async () => {
      rtMemberA.clear();
      const res = await http()
        .post('/api/fridge/consume')
        .set(auth(homemakerA))
        .send({ items: [{ foodId: tomato.id, quantity: 1000, unitId: g.id }] })
        .expect(200);
      const changes = data<ChangeBody[]>(res);
      expect(changes).toEqual([
        expect.objectContaining({ fridgeItemId: soonTomatoId, quantity: 0.7, remaining: 0 }),
        expect.objectContaining({ fridgeItemId: freshTomatoId, quantity: 0.3, remaining: 0.9 }),
      ]);
      expect(changes[0]?.state).toBe(FridgeItemState.Consumed);

      const expiredLot = await ds
        .getRepository(FridgeItem)
        .findOneByOrFail({ id: expiredTomatoId });
      expect(expiredLot.quantity).toBe(0.3);
      const consumed = await ds.getRepository(InventoryTransaction).findBy({
        fridgeItemId: In([soonTomatoId, freshTomatoId]),
        type: InventoryTransactionType.Consume,
      });
      expect(consumed.map((t) => t.quantity).sort()).toEqual([0.3, 0.7]);
      const changed = await rtMemberA.next(REALTIME_EVENTS.FRIDGE_ITEMS_CHANGED);
      expect(changed).toMatchObject({ reason: 'consumed' });
    });

    it('không đủ hàng còn hạn → 409 FRIDGE_INSUFFICIENT_STOCK, không trừ gì (BR-03)', async () => {
      const before = await ds.getRepository(FridgeItem).findOneByOrFail({ id: freshTomatoId });
      const res = await http()
        .post('/api/fridge/consume')
        .set(auth(homemakerA))
        .send({
          items: [
            { fridgeItemId: freshTomatoId, quantity: 0.1 },
            { foodId: tomato.id, quantity: 1, unitId: kg.id },
          ],
        })
        .expect(409);
      expect(error(res)).toMatchObject({
        code: ErrorCode.InsufficientStock,
        details: { foodId: tomato.id, line: 1, available: 0.8, requested: 1 },
      });
      const after = await ds.getRepository(FridgeItem).findOneByOrFail({ id: freshTomatoId });
      expect(after.quantity).toBe(before.quantity);

      await http()
        .post('/api/fridge/consume')
        .set(auth(homemakerA))
        .send({ items: [{ fridgeItemId: freshTomatoId, quantity: 0 }] })
        .expect(400);
      await http()
        .post('/api/fridge/consume')
        .set(auth(homemakerA))
        .send({ items: [{ fridgeItemId: freshTomatoId, foodId: tomato.id, quantity: 1 }] })
        .expect(400);
      await http()
        .post('/api/fridge/consume')
        .set(auth(homemakerA))
        .send({ items: [{ fridgeItemId: freshTomatoId, quantity: 1, unitId: pack.id }] })
        .expect(422);
    });

    it('huỷ lô hết hạn → DISCARD (lãng phí), trạng thái DISCARDED; huỷ lại → 409', async () => {
      const res = await http()
        .post('/api/fridge/discard')
        .set(auth(homemakerA))
        .send({ items: [{ fridgeItemId: expiredTomatoId }] })
        .expect(200);
      expect(data<ChangeBody[]>(res)).toEqual([
        expect.objectContaining({ quantity: 0.3, remaining: 0, state: FridgeItemState.Discarded }),
      ]);
      const detail = await http()
        .get(`/api/fridge/items/${expiredTomatoId}`)
        .set(auth(memberA))
        .expect(200);
      expect(
        data<{ state: FridgeItemState; transactions: { type: string }[] }>(detail),
      ).toMatchObject({
        state: FridgeItemState.Discarded,
        transactions: [
          { type: InventoryTransactionType.Discard },
          { type: InventoryTransactionType.Add },
        ],
      });
      const again = await http()
        .post('/api/fridge/discard')
        .set(auth(homemakerA))
        .send({ items: [{ fridgeItemId: expiredTomatoId }] })
        .expect(409);
      expect(error(again).code).toBe(ErrorCode.InsufficientStock);
      // Lô hết hàng không còn trong danh sách tra cứu.
      expect((await fridgeLots(homemakerA)).map((l) => l.id)).not.toContain(expiredTomatoId);
    });

    it('sửa hạn dùng (BR-02); gia đình B không thấy/không trừ được kho của A (BR-06)', async () => {
      const res = await http()
        .patch(`/api/fridge/items/${freshTomatoId}`)
        .set(auth(homemakerA))
        .send({ expiryDate: addDays(today, 10), storageLocation: StorageLocation.Freezer })
        .expect(200);
      expect(data<FridgeBody>(res)).toMatchObject({
        expiryDate: addDays(today, 10),
        storageLocation: StorageLocation.Freezer,
        state: FridgeItemState.Fresh,
      });

      expect(await fridgeLots(homemakerB)).toEqual([]);
      await http().get(`/api/fridge/items/${freshTomatoId}`).set(auth(homemakerB)).expect(404);
      await http()
        .post('/api/fridge/consume')
        .set(auth(homemakerB))
        .send({ items: [{ fridgeItemId: freshTomatoId, quantity: 0.1 }] })
        .expect(404);
      const fefoB = await http()
        .post('/api/fridge/consume')
        .set(auth(homemakerB))
        .send({ items: [{ foodId: tomato.id, quantity: 0.1, unitId: kg.id }] })
        .expect(409);
      expect(error(fefoB).details).toMatchObject({ available: 0 });
      await settle();
      expect(rtB.names()).not.toContain(REALTIME_EVENTS.FRIDGE_ITEMS_CHANGED);
    });
  });
});
