import {
  ApprovalStatus,
  InventoryTransactionType,
  RecipeSource,
  ShoppingListStatus,
  UserStatus,
} from '@dctl/shared';
import { type EntityManager, In } from 'typeorm';
import { addDays } from '../../common/utils/date.util';
import { hashPassword } from '../../common/utils/password.util';
import { Family } from '../../modules/families/entities/family.entity';
import { FridgeItem } from '../../modules/fridge/entities/fridge-item.entity';
import { InventoryTransaction } from '../../modules/fridge/entities/inventory-transaction.entity';
import { Category } from '../../modules/master-data/entities/category.entity';
import { Food } from '../../modules/master-data/entities/food.entity';
import { RecipeIngredient } from '../../modules/master-data/entities/recipe-ingredient.entity';
import { Recipe } from '../../modules/master-data/entities/recipe.entity';
import { Unit } from '../../modules/master-data/entities/unit.entity';
import { NUTRITION_SOURCE_PENDING } from '../../modules/master-data/master-data.types';
import { ShoppingListItem } from '../../modules/shopping/entities/shopping-list-item.entity';
import { ShoppingList } from '../../modules/shopping/entities/shopping-list.entity';
import { DietaryProfile } from '../../modules/users/entities/dietary-profile.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  ADMIN_SEED,
  DEMO_FAMILY_INVITE_CODE,
  DEMO_FAMILY_NAME,
  DEMO_PENDING_FOOD,
  DEMO_PENDING_RECIPE,
  DEMO_SHOPPING_LIST,
  DIETARY_PROFILE_SEEDS,
  FRIDGE_ITEM_SEEDS,
  HOMEMAKER_SEED,
  MEMBER_SEEDS,
  type UserSeed,
} from './data/demo.data';
import { loadByKey, must, seedId, upsertRows } from './seed.helpers';
import { type SeedContext, type Seeder } from './seeder.interface';

const FAMILY_USERS: readonly UserSeed[] = [HOMEMAKER_SEED, ...MEMBER_SEEDS];
const DEMO_FAMILY_ID = seedId('family', DEMO_FAMILY_NAME);

async function loadDemoFamily(manager: EntityManager): Promise<Family> {
  const family = await manager.findOneBy(Family, { id: DEMO_FAMILY_ID });
  if (!family) {
    throw new Error('Demo family not found — run the "demo-family" seeder first.');
  }
  return family;
}

/**
 * Tài khoản admin + gia đình mẫu gồm 1 nội trợ (chủ gia đình) và 2 thành viên (BR-11),
 * kèm hồ sơ ăn uống (thanhvien1 dị ứng Tôm — dữ liệu kiểm thử BR-07).
 */
export const demoFamilySeeder: Seeder = {
  name: 'demo-family',
  async run(manager: EntityManager) {
    const allUsers = [ADMIN_SEED, ...FAMILY_USERS];
    const rows = await Promise.all(
      allUsers.map(async (u) => ({
        id: seedId('user', u.username),
        username: u.username,
        email: u.email,
        passwordHash: await hashPassword(u.password),
        role: u.role,
        status: UserStatus.Active,
        familyId: null,
      })),
    );
    await upsertRows(
      manager,
      User,
      rows,
      ['username'],
      ['email', 'password_hash', 'role', 'status'],
    );

    const users = await loadByKey(
      manager,
      User,
      'username',
      allUsers.map((u) => u.username),
    );
    const owner = must(users, HOMEMAKER_SEED.username);

    await upsertRows(
      manager,
      Family,
      [
        {
          id: DEMO_FAMILY_ID,
          name: DEMO_FAMILY_NAME,
          ownerId: owner.id,
          inviteCode: DEMO_FAMILY_INVITE_CODE,
        },
      ],
      ['id'],
      ['name', 'owner_id', 'invite_code'],
    );

    // Admin never belongs to a family; family users join the demo family (BR-11).
    await manager.update(User, { id: must(users, ADMIN_SEED.username).id }, { familyId: null });
    for (const u of FAMILY_USERS) {
      await manager.update(
        User,
        { id: must(users, u.username).id },
        { familyId: DEMO_FAMILY_ID, role: u.role },
      );
    }

    const allergens = await loadByKey(
      manager,
      Food,
      'name',
      DIETARY_PROFILE_SEEDS.flatMap((p) => p.allergies),
    );
    await upsertRows(
      manager,
      DietaryProfile,
      DIETARY_PROFILE_SEEDS.map((p) => ({
        userId: must(users, p.username).id,
        allergies: p.allergies.map((name) => ({ foodId: must(allergens, name).id, name })),
        tastePreferences: p.tastePreferences,
        nutritionGoal: p.nutritionGoal,
      })),
      ['user_id'],
      ['allergies', 'taste_preferences', 'nutrition_goal'],
    );
  },
};

/**
 * Kho mẫu của gia đình demo; hạn dùng tính tương đối theo hôm nay để luôn có đủ các mốc
 * biên BR-01 (4, 3, 1, 0, −1 ngày). Mỗi lô có một giao dịch ADD trong inventory_transactions.
 */
export const demoFridgeSeeder: Seeder = {
  name: 'demo-fridge',
  async run(manager: EntityManager, { today }: SeedContext) {
    const family = await loadDemoFamily(manager);
    const foods = await loadByKey(
      manager,
      Food,
      'name',
      FRIDGE_ITEM_SEEDS.map((i) => i.food),
    );
    const units = await loadByKey(
      manager,
      Unit,
      'symbol',
      FRIDGE_ITEM_SEEDS.map((i) => i.unit),
    );

    const items = FRIDGE_ITEM_SEEDS.map((i) => {
      const food = must(foods, i.food);
      return {
        id: seedId('fridge-item', i.key),
        familyId: family.id,
        foodId: food.id,
        name: food.name,
        categoryId: food.categoryId,
        quantity: i.quantity,
        unitId: must(units, i.unit).id,
        expiryDate: addDays(today, i.expiresInDays),
        storageLocation: i.location,
        purchasedPrice: i.price ?? null,
      };
    });
    await upsertRows(
      manager,
      FridgeItem,
      items,
      ['id'],
      [
        'family_id',
        'food_id',
        'name',
        'category_id',
        'quantity',
        'unit_id',
        'expiry_date',
        'storage_location',
        'purchased_price',
      ],
    );

    await upsertRows(
      manager,
      InventoryTransaction,
      items.map((item) => ({
        id: seedId('inventory-transaction', `${item.id}:add`),
        fridgeItemId: item.id,
        type: InventoryTransactionType.Add,
        quantity: item.quantity,
        userId: family.ownerId,
      })),
      ['id'],
      [],
    );
  },
};

/**
 * Nội dung chờ duyệt để thử kiểm duyệt (UC-ADM-03): tên "Rau dền" do gia đình demo đề xuất
 * (PENDING, chỉ gia đình demo thấy — BR-04) và một công thức của thanhvien2 dùng tên đó (BR-08).
 */
export const demoContributionsSeeder: Seeder = {
  name: 'demo-contributions',
  async run(manager: EntityManager) {
    const family = await loadDemoFamily(manager);
    const categories = await loadByKey(manager, Category, 'name', [DEMO_PENDING_FOOD.category]);
    await upsertRows(
      manager,
      Food,
      [
        {
          id: seedId('food', DEMO_PENDING_FOOD.name),
          name: DEMO_PENDING_FOOD.name,
          categoryId: must(categories, DEMO_PENDING_FOOD.category).id,
          approvalStatus: ApprovalStatus.Pending,
          createdByFamilyId: family.id,
        },
      ],
      ['name'],
      ['category_id', 'approval_status', 'created_by_family_id'],
    );

    const recipe = DEMO_PENDING_RECIPE;
    const foods = await loadByKey(
      manager,
      Food,
      'name',
      recipe.ingredients.map((i) => i.food),
    );
    const units = await loadByKey(
      manager,
      Unit,
      'symbol',
      recipe.ingredients.map((i) => i.unit),
    );
    const contributor = must(
      await loadByKey(manager, User, 'username', [recipe.contributor]),
      recipe.contributor,
    );
    const recipeId = seedId('recipe', recipe.name);
    await upsertRows(
      manager,
      Recipe,
      [
        {
          id: recipeId,
          name: recipe.name,
          instructions: recipe.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
          nutritionInfo: { servings: recipe.servings, source: NUTRITION_SOURCE_PENDING },
          source: RecipeSource.User,
          approvalStatus: ApprovalStatus.Pending,
          createdBy: contributor.id,
        },
      ],
      ['id'],
      ['name', 'instructions', 'nutrition_info', 'source', 'approval_status', 'created_by'],
    );
    await manager.delete(RecipeIngredient, { recipeId: In([recipeId]) });
    await upsertRows(
      manager,
      RecipeIngredient,
      recipe.ingredients.map((i) => {
        const food = must(foods, i.food);
        return {
          id: seedId('recipe-ingredient', `${recipe.name}#${i.food}`),
          recipeId,
          foodId: food.id,
          ingredientName: food.name,
          categoryId: food.categoryId,
          quantity: i.quantity,
          unitId: must(units, i.unit).id,
        };
      }),
      ['id'],
      [],
    );
  },
};

/** Một danh sách mua sắm nháp cho hôm nay, có phân công và một mặt hàng nhập tự do (food_id NULL). */
export const demoShoppingSeeder: Seeder = {
  name: 'demo-shopping',
  async run(manager: EntityManager, { today }: SeedContext) {
    const family = await loadDemoFamily(manager);
    const { items } = DEMO_SHOPPING_LIST;
    const foodNames = items.flatMap((i) => (i.food === null ? [] : [i.food]));
    const foods = await loadByKey(manager, Food, 'name', foodNames);
    const categories = await loadByKey(
      manager,
      Category,
      'name',
      items.map((i) => i.category),
    );
    const units = await loadByKey(
      manager,
      Unit,
      'symbol',
      items.map((i) => i.unit),
    );
    const assignees = await loadByKey(
      manager,
      User,
      'username',
      items.flatMap((i) => (i.assignee === undefined ? [] : [i.assignee])),
    );

    const listId = seedId('shopping-list', DEMO_SHOPPING_LIST.key);
    await upsertRows(
      manager,
      ShoppingList,
      [
        {
          id: listId,
          familyId: family.id,
          targetDate: today,
          periodType: DEMO_SHOPPING_LIST.periodType,
          status: ShoppingListStatus.Draft,
          createdBy: family.ownerId,
        },
      ],
      ['id'],
      ['family_id', 'target_date', 'period_type', 'status', 'created_by'],
    );

    // Reset the demo items to their initial (not purchased) state on every run.
    await manager.delete(ShoppingListItem, { shoppingListId: In([listId]) });
    await upsertRows(
      manager,
      ShoppingListItem,
      items.map((i) => ({
        id: seedId('shopping-list-item', `${DEMO_SHOPPING_LIST.key}:${i.key}`),
        shoppingListId: listId,
        foodId: i.food === null ? null : must(foods, i.food).id,
        itemName: i.itemName,
        categoryId: must(categories, i.category).id,
        expectedQuantity: i.quantity,
        unitId: must(units, i.unit).id,
        isPurchased: false,
        assigneeId: i.assignee === undefined ? null : must(assignees, i.assignee).id,
      })),
      ['id'],
      [],
    );
  },
};
