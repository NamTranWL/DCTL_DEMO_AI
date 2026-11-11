/**
 * e2e (B5): master data against real PostgreSQL (needs the seed: admin/Admin@123, 74 foods…).
 *
 * Families A and B are created fresh; contributions of A must stay invisible to B until an
 * admin approves them (BR-04, BR-08). Admin endpoints are ADMIN-only.
 */
import { ApprovalStatus } from '@dctl/shared';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { ErrorCode } from '../src/common/exceptions/error-code.enum';
import { Family } from '../src/modules/families/entities/family.entity';
import { Category } from '../src/modules/master-data/entities/category.entity';
import { Food } from '../src/modules/master-data/entities/food.entity';
import { Recipe } from '../src/modules/master-data/entities/recipe.entity';
import { Unit } from '../src/modules/master-data/entities/unit.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createTestApp, uniqueSuffix } from './helpers/test-app';

interface FoodBody {
  id: string;
  name: string;
  approvalStatus: ApprovalStatus;
  isPendingOwn: boolean;
}
interface RecipeBody {
  id: string;
  name: string;
  approvalStatus: ApprovalStatus;
  favoriteCount: number;
  isFavorite: boolean;
  ingredients: { foodId: string | null; name: string }[];
}

const PASSWORD = 'Test@1234';

describe('Master data (e2e)', () => {
  let app: INestApplication<App>;
  const suffix = uniqueSuffix();
  const cleanup = {
    usernames: [] as string[],
    familyIds: [] as string[],
    foodNames: [] as string[],
    recipeIds: [] as string[],
    categoryIds: [] as string[],
    unitIds: [] as string[],
  };

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const data = <T>(res: request.Response): T => (res.body as { data: T }).data;

  let adminToken: string;
  let tokenA: string;
  let tokenA2: string;
  let tokenB: string;
  let categoryVegId: string;
  let unitGramId: string;
  let unitKgId: string;
  let unitMlId: string;
  let unitBunchId: string;

  async function login(loginName: string, password: string): Promise<string> {
    const res = await http()
      .post('/api/auth/login')
      .send({ login: loginName, password })
      .expect(200);
    return data<{ accessToken: string }>(res).accessToken;
  }

  async function registerWithFamily(
    name: string,
    inviteCode?: string,
  ): Promise<{ token: string; inviteCode?: string }> {
    const username = `${name}_${suffix}`.toLowerCase();
    cleanup.usernames.push(username);
    const reg = await http()
      .post('/api/auth/register')
      .send({ username, email: `${username}@e2e.test`, password: PASSWORD })
      .expect(201);
    const token = data<{ accessToken: string }>(reg).accessToken;
    if (inviteCode) {
      await http().post('/api/families/join').set(auth(token)).send({ inviteCode }).expect(200);
      return { token };
    }
    const fam = await http()
      .post('/api/families')
      .set(auth(token))
      .send({ name: `Nhà ${name} ${suffix}` })
      .expect(201);
    const family = data<{ id: string; inviteCode: string }>(fam);
    cleanup.familyIds.push(family.id);
    return { token, inviteCode: family.inviteCode };
  }

  async function search(token: string, q: string): Promise<FoodBody[]> {
    const res = await http()
      .get('/api/foods/search')
      .query({ q, limit: 20 })
      .set(auth(token))
      .expect(200);
    return data<FoodBody[]>(res);
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await login('admin', 'Admin@123');
    const a = await registerWithFamily('mdA');
    tokenA = a.token;
    tokenA2 = (await registerWithFamily('mdA2', a.inviteCode)).token;
    tokenB = (await registerWithFamily('mdB')).token;

    const ds = app.get(DataSource);
    categoryVegId = (await ds.getRepository(Category).findOneByOrFail({ name: 'Rau lá' })).id;
    const units = await ds.getRepository(Unit).findBy({ symbol: In(['g', 'kg', 'ml', 'bó']) });
    const bySymbol = new Map(units.map((u) => [u.symbol, u.id]));
    unitGramId = bySymbol.get('g') ?? '';
    unitKgId = bySymbol.get('kg') ?? '';
    unitMlId = bySymbol.get('ml') ?? '';
    unitBunchId = bySymbol.get('bó') ?? '';
  });

  afterAll(async () => {
    const ds = app.get(DataSource);
    if (cleanup.recipeIds.length)
      await ds.getRepository(Recipe).delete({ id: In(cleanup.recipeIds) });
    if (cleanup.foodNames.length)
      await ds.getRepository(Food).delete({ name: In(cleanup.foodNames) });
    if (cleanup.unitIds.length) await ds.getRepository(Unit).delete({ id: In(cleanup.unitIds) });
    if (cleanup.categoryIds.length) {
      await ds.getRepository(Category).delete({ id: In(cleanup.categoryIds) });
    }
    if (cleanup.familyIds.length)
      await ds.getRepository(Family).delete({ id: In(cleanup.familyIds) });
    if (cleanup.usernames.length)
      await ds.getRepository(User).delete({ username: In(cleanup.usernames) });
    await app.close();
  });

  describe('Food lookup (FR-09, FR-12): accent- and case-insensitive', () => {
    it.each(['thit ba chi', 'THỊT BA', 'ba chi'])('"%s" finds "Thịt ba chỉ"', async (q) => {
      const names = (await search(tokenA, q)).map((f) => f.name);
      expect(names).toContain('Thịt ba chỉ');
    });

    it('ranks prefix matches first', async () => {
      const names = (await search(tokenA, 'ca')).map((f) => f.name);
      expect(names.slice(0, 3).every((n) => n.toLowerCase().startsWith('c'))).toBe(true);
    });

    it('treats LIKE wildcards literally', async () => {
      expect(await search(tokenA, '%')).toEqual([]);
    });
  });

  describe('Contribute a new food → PENDING, visible only to the proposing family (BR-04)', () => {
    const rawName = `  lá  LỐT e2e${suffix} `;
    const name = `Lá lốt e2e${suffix}`;
    let foodId: string;

    it('creates a normalized PENDING food (201)', async () => {
      cleanup.foodNames.push(name);
      const res = await http()
        .post('/api/foods')
        .set(auth(tokenA))
        .send({ name: rawName, categoryId: categoryVegId })
        .expect(201);
      const body = data<{ food: FoodBody; created: boolean }>(res);
      foodId = body.food.id;

      expect(body).toMatchObject({
        created: true,
        food: { name, approvalStatus: ApprovalStatus.Pending, isPendingOwn: true },
      });
    });

    it('is idempotent for the same family (200, created=false)', async () => {
      const res = await http()
        .post('/api/foods')
        .set(auth(tokenA2))
        .send({ name: name.toUpperCase(), categoryId: categoryVegId })
        .expect(200);
      expect(data<{ food: FoodBody; created: boolean }>(res)).toMatchObject({
        created: false,
        food: { id: foodId },
      });
    });

    it('both members of family A find it; family B and the admin do not', async () => {
      expect((await search(tokenA2, `la lot e2e${suffix}`)).map((f) => f.id)).toContain(foodId);
      expect(await search(tokenB, `la lot e2e${suffix}`)).toEqual([]);
      expect(await search(adminToken, `la lot e2e${suffix}`)).toEqual([]);
    });

    it('family B proposing the same name gets 409 FOOD_PENDING_REVIEW', async () => {
      const res = await http()
        .post('/api/foods')
        .set(auth(tokenB))
        .send({ name, categoryId: categoryVegId })
        .expect(409);
      expect(res.body).toMatchObject({ code: ErrorCode.FoodPendingReview });
    });

    it('a user without a family cannot contribute (FAMILY_REQUIRED)', async () => {
      const res = await http()
        .post('/api/foods')
        .set(auth(adminToken))
        .send({ name: 'Gì đó', categoryId: categoryVegId })
        .expect(403);
      expect(res.body).toMatchObject({ code: ErrorCode.FamilyRequired });
    });

    it('UC-ADM-03: the admin sees it in the PENDING queue and approves it', async () => {
      const queue = await http()
        .get('/api/admin/foods')
        .query({ status: ApprovalStatus.Pending, q: `la lot e2e${suffix}` })
        .set(auth(adminToken))
        .expect(200);
      expect(data<FoodBody[]>(queue).map((f) => f.id)).toEqual([foodId]);

      await http()
        .post(`/api/admin/moderation/foods/${foodId}/approve`)
        .set(auth(adminToken))
        .expect(200);
    });

    it('after approval family B finds it and proposing it returns the existing row', async () => {
      expect((await search(tokenB, `la lot e2e${suffix}`)).map((f) => f.id)).toContain(foodId);
      await http()
        .post('/api/foods')
        .set(auth(tokenB))
        .send({ name, categoryId: categoryVegId })
        .expect(200);
    });

    it('a rejected name cannot be proposed again (409 FOOD_REJECTED)', async () => {
      const rejected = `Rau thử e2e${suffix}`;
      cleanup.foodNames.push(rejected);
      const created = await http()
        .post('/api/foods')
        .set(auth(tokenA))
        .send({ name: rejected, categoryId: categoryVegId })
        .expect(201);
      const id = data<{ food: FoodBody }>(created).food.id;
      await http()
        .post(`/api/admin/moderation/foods/${id}/reject`)
        .set(auth(adminToken))
        .send({ reason: 'Không rõ ràng' })
        .expect(200);

      const res = await http()
        .post('/api/foods')
        .set(auth(tokenB))
        .send({ name: rejected, categoryId: categoryVegId })
        .expect(409);
      expect(res.body).toMatchObject({ code: ErrorCode.FoodRejected });
      // Approving a rejected food is an invalid transition.
      await http()
        .post(`/api/admin/moderation/foods/${id}/approve`)
        .set(auth(adminToken))
        .expect(409);
    });
  });

  describe('Recipes (UC-RCP-01, FR-17, FR-26, BR-08)', () => {
    let pendingFoodId: string;
    let recipeId: string;

    it('a member of A contributes a recipe using A’s own pending food → PENDING', async () => {
      const foodName = `Rau đay e2e${suffix}`;
      cleanup.foodNames.push(foodName);
      const food = await http()
        .post('/api/foods')
        .set(auth(tokenA))
        .send({ name: foodName, categoryId: categoryVegId })
        .expect(201);
      pendingFoodId = data<{ food: FoodBody }>(food).food.id;

      const res = await http()
        .post('/api/recipes')
        .set(auth(tokenA2))
        .send({
          name: `Canh rau đay e2e${suffix}`,
          steps: ['Nhặt rau', 'Nấu canh'],
          servings: 3,
          ingredients: [
            { foodId: pendingFoodId, quantity: 1, unitId: unitBunchId },
            { name: 'tôm', quantity: 100, unitId: unitGramId },
            { name: 'Mồng tơi lạ', quantity: 50, unitId: unitGramId, categoryId: categoryVegId },
          ],
        })
        .expect(201);
      const recipe = data<RecipeBody>(res);
      recipeId = recipe.id;
      cleanup.recipeIds.push(recipeId);

      expect(recipe.approvalStatus).toBe(ApprovalStatus.Pending);
      expect(recipe.ingredients.find((i) => i.name === 'Tôm')?.foodId).toEqual(expect.any(String));
      expect(recipe.ingredients.find((i) => i.name === 'Mồng tơi lạ')?.foodId).toBeNull();
    });

    it('the other member of A sees it; family B does not (404 + not listed)', async () => {
      await http().get(`/api/recipes/${recipeId}`).set(auth(tokenA)).expect(200);

      const res = await http().get(`/api/recipes/${recipeId}`).set(auth(tokenB)).expect(404);
      expect(res.body).toMatchObject({ code: ErrorCode.NotFound });
      const list = await http()
        .get('/api/recipes')
        .query({ q: `rau day e2e${suffix}` })
        .set(auth(tokenB))
        .expect(200);
      expect(data<RecipeBody[]>(list)).toEqual([]);
    });

    it('family B cannot use A’s pending food in its own recipe', async () => {
      const res = await http()
        .post('/api/recipes')
        .set(auth(tokenB))
        .send({
          name: 'Ăn cắp nguyên liệu',
          steps: ['x'],
          servings: 1,
          ingredients: [{ foodId: pendingFoodId, quantity: 1, unitId: unitBunchId }],
        })
        .expect(400);
      expect(res.body).toMatchObject({ code: ErrorCode.FoodNotAvailable });
    });

    it('rejects duplicate ingredients', async () => {
      const res = await http()
        .post('/api/recipes')
        .set(auth(tokenA))
        .send({
          name: 'Trùng',
          steps: ['x'],
          servings: 1,
          ingredients: [
            { name: 'Tôm', quantity: 1, unitId: unitGramId },
            { name: 'TÔM', quantity: 2, unitId: unitGramId },
          ],
        })
        .expect(400);
      expect(res.body).toMatchObject({ code: ErrorCode.DuplicateIngredient });
    });

    it('only the contributor can edit while pending', async () => {
      const update = {
        name: `Canh rau đay e2e${suffix}`,
        steps: ['Nhặt rau', 'Nấu canh', 'Nêm'],
        servings: 3,
        ingredients: [{ foodId: pendingFoodId, quantity: 2, unitId: unitBunchId }],
      };
      await http().put(`/api/recipes/${recipeId}`).set(auth(tokenA)).send(update).expect(403);
      await http().put(`/api/recipes/${recipeId}`).set(auth(tokenA2)).send(update).expect(200);
    });

    it('admin approves → visible to B; contributor can no longer edit', async () => {
      await http()
        .post(`/api/admin/moderation/recipes/${recipeId}/approve`)
        .set(auth(adminToken))
        .expect(200);
      await http().get(`/api/recipes/${recipeId}`).set(auth(tokenB)).expect(200);
      const res = await http().delete(`/api/recipes/${recipeId}`).set(auth(tokenA2)).expect(403);
      expect(res.body).toMatchObject({ code: ErrorCode.RecipeNotEditable });
    });

    it('favorites: add (idempotent), count, list, remove', async () => {
      await http().post(`/api/recipes/${recipeId}/favorite`).set(auth(tokenB)).expect(204);
      await http().post(`/api/recipes/${recipeId}/favorite`).set(auth(tokenB)).expect(204);
      await http().post(`/api/recipes/${recipeId}/favorite`).set(auth(tokenA)).expect(204);

      const detail = data<RecipeBody>(
        await http().get(`/api/recipes/${recipeId}`).set(auth(tokenB)).expect(200),
      );
      expect(detail).toMatchObject({ favoriteCount: 2, isFavorite: true });

      const favs = data<RecipeBody[]>(
        await http().get('/api/recipes/favorites').set(auth(tokenB)).expect(200),
      );
      expect(favs.map((r) => r.id)).toEqual([recipeId]);

      await http().delete(`/api/recipes/${recipeId}/favorite`).set(auth(tokenB)).expect(204);
      const after = data<RecipeBody>(
        await http().get(`/api/recipes/${recipeId}`).set(auth(tokenB)).expect(200),
      );
      expect(after).toMatchObject({ favoriteCount: 1, isFavorite: false });
    });
  });

  describe('Admin CRUD (UC-ADM-02) and permissions', () => {
    it('non-admins get 403 on every admin route', async () => {
      for (const path of [
        '/api/admin/foods',
        '/api/admin/recipes',
        '/api/admin/moderation/summary',
      ]) {
        await http().get(path).set(auth(tokenA)).expect(403);
      }
      await http()
        .post('/api/admin/categories')
        .set(auth(tokenA))
        .send({ name: 'x', defaultShelfLifeDays: 1 })
        .expect(403);
    });

    it('category: create, duplicate 409, update, delete; in-use delete 409', async () => {
      const created = await http()
        .post('/api/admin/categories')
        .set(auth(adminToken))
        .send({ name: `Nấm e2e${suffix}`, storageAdvice: 'Ngăn mát', defaultShelfLifeDays: 4 })
        .expect(201);
      const id = data<{ id: string }>(created).id;
      cleanup.categoryIds.push(id);

      await http()
        .post('/api/admin/categories')
        .set(auth(adminToken))
        .send({ name: `Nấm e2e${suffix}`, defaultShelfLifeDays: 4 })
        .expect(409);
      const patched = await http()
        .patch(`/api/admin/categories/${id}`)
        .set(auth(adminToken))
        .send({ defaultShelfLifeDays: 5 })
        .expect(200);
      expect(data<{ defaultShelfLifeDays: number }>(patched).defaultShelfLifeDays).toBe(5);
      await http().delete(`/api/admin/categories/${id}`).set(auth(adminToken)).expect(204);
      cleanup.categoryIds.pop();

      const res = await http()
        .delete(`/api/admin/categories/${categoryVegId}`)
        .set(auth(adminToken))
        .expect(409);
      expect(res.body).toMatchObject({ code: ErrorCode.MasterDataInUse });
    });

    it('units: derived unit + conversion; cross-group conversion 422', async () => {
      const created = await http()
        .post('/api/admin/units')
        .set(auth(adminToken))
        .send({
          symbol: `lạng${suffix}`.slice(0, 20),
          name: 'lạng',
          baseUnitId: unitGramId,
          factorToBase: 100,
        })
        .expect(201);
      const id = data<{ id: string }>(created).id;
      cleanup.unitIds.push(id);

      const ok = await http()
        .get('/api/units/convert')
        .query({ quantity: 2.5, fromUnitId: id, toUnitId: unitKgId })
        .set(auth(tokenA))
        .expect(200);
      expect(data<{ result: number }>(ok).result).toBe(0.25);

      const ko = await http()
        .get('/api/units/convert')
        .query({ quantity: 1, fromUnitId: unitGramId, toUnitId: unitMlId })
        .set(auth(tokenA))
        .expect(422);
      expect(ko.body).toMatchObject({ code: ErrorCode.UnitIncompatible });
    });

    it('foods: admin creates APPROVED; deleting a food used in the fridge → 409 FOOD_IN_USE', async () => {
      const name = `Su hào e2e${suffix}`;
      cleanup.foodNames.push(name);
      const created = await http()
        .post('/api/admin/foods')
        .set(auth(adminToken))
        .send({ name, categoryId: categoryVegId })
        .expect(201);
      expect(data<FoodBody>(created).approvalStatus).toBe(ApprovalStatus.Approved);
      await http()
        .post('/api/admin/foods')
        .set(auth(adminToken))
        .send({ name, categoryId: categoryVegId })
        .expect(409);

      const used = await app
        .get(DataSource)
        .getRepository(Food)
        .findOneByOrFail({ name: 'Thịt ba chỉ' });
      const res = await http()
        .delete(`/api/admin/foods/${used.id}`)
        .set(auth(adminToken))
        .expect(409);
      expect(res.body).toMatchObject({ code: ErrorCode.FoodInUse });
    });

    it('moderation summary counts pending items', async () => {
      const res = await http()
        .get('/api/admin/moderation/summary')
        .set(auth(adminToken))
        .expect(200);
      const summary = data<{ pendingFoods: number; pendingRecipes: number }>(res);
      expect(Number.isInteger(summary.pendingFoods)).toBe(true);
      expect(Number.isInteger(summary.pendingRecipes)).toBe(true);
    });
  });
});
