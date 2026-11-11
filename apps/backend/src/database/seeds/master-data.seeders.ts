import { ApprovalStatus, RecipeSource } from '@dctl/shared';
import { type EntityManager, In } from 'typeorm';
import { Category } from '../../modules/master-data/entities/category.entity';
import { Food } from '../../modules/master-data/entities/food.entity';
import { RecipeIngredient } from '../../modules/master-data/entities/recipe-ingredient.entity';
import { Recipe } from '../../modules/master-data/entities/recipe.entity';
import { Unit } from '../../modules/master-data/entities/unit.entity';
import { NUTRITION_SOURCE_PENDING } from '../../modules/master-data/master-data.types';
import { CATEGORY_SEEDS, FOOD_SEEDS, RECIPE_SEEDS, UNIT_SEEDS } from './data/master-data.data';
import { loadByKey, must, seedId, upsertRows } from './seed.helpers';
import { type Seeder } from './seeder.interface';

/** Danh mục thực phẩm kèm gợi ý bảo quản và hạn dùng mặc định (FR-11, BR-02). */
export const categorySeeder: Seeder = {
  name: 'categories',
  async run(manager: EntityManager) {
    await upsertRows(
      manager,
      Category,
      CATEGORY_SEEDS.map((c) => ({
        id: seedId('category', c.name),
        name: c.name,
        storageAdvice: c.storageAdvice,
        defaultShelfLifeDays: c.defaultShelfLifeDays,
      })),
      ['name'],
      ['storage_advice', 'default_shelf_life_days'],
    );
  },
};

/** Đơn vị tính: đơn vị gốc trước, đơn vị dẫn xuất sau (BR-04). */
export const unitSeeder: Seeder = {
  name: 'units',
  async run(manager: EntityManager) {
    const baseUnits = UNIT_SEEDS.filter((u) => u.base === undefined);
    const derivedUnits = UNIT_SEEDS.filter((u) => u.base !== undefined);

    await upsertRows(
      manager,
      Unit,
      baseUnits.map((u) => ({
        id: seedId('unit', u.symbol),
        symbol: u.symbol,
        name: u.name,
        baseUnitId: null,
        factorToBase: 1,
      })),
      ['symbol'],
      ['name', 'base_unit_id', 'factor_to_base'],
    );

    const bases = await loadByKey(
      manager,
      Unit,
      'symbol',
      derivedUnits.map((u) => u.base!),
    );
    await upsertRows(
      manager,
      Unit,
      derivedUnits.map((u) => ({
        id: seedId('unit', u.symbol),
        symbol: u.symbol,
        name: u.name,
        baseUnitId: must(bases, u.base!).id,
        factorToBase: u.factorToBase ?? 1,
      })),
      ['symbol'],
      ['name', 'base_unit_id', 'factor_to_base'],
    );
  },
};

/** Thực phẩm chuẩn đã duyệt (APPROVED), gắn danh mục (BR-04). */
export const foodSeeder: Seeder = {
  name: 'foods',
  async run(manager: EntityManager) {
    const categories = await loadByKey(
      manager,
      Category,
      'name',
      FOOD_SEEDS.map((f) => f.category),
    );
    await upsertRows(
      manager,
      Food,
      FOOD_SEEDS.map((f) => ({
        id: seedId('food', f.name),
        name: f.name,
        categoryId: must(categories, f.category).id,
        approvalStatus: ApprovalStatus.Approved,
        createdByFamilyId: null,
      })),
      ['name'],
      ['category_id', 'approval_status'],
    );
  },
};

/**
 * 10 công thức chuẩn (SYSTEM, APPROVED); mọi nguyên liệu gắn food_id để server tự tính
 * nguyên liệu có sẵn/còn thiếu (BR-10) và làm nguồn gợi ý dự phòng của AI (§8).
 */
export const recipeSeeder: Seeder = {
  name: 'recipes',
  async run(manager: EntityManager) {
    const foods = await loadByKey(
      manager,
      Food,
      'name',
      RECIPE_SEEDS.flatMap((r) => r.ingredients.map((i) => i.food)),
    );
    const units = await loadByKey(
      manager,
      Unit,
      'symbol',
      RECIPE_SEEDS.flatMap((r) => r.ingredients.map((i) => i.unit)),
    );

    const recipeIds = RECIPE_SEEDS.map((r) => seedId('recipe', r.name));
    await upsertRows(
      manager,
      Recipe,
      RECIPE_SEEDS.map((r, index) => ({
        id: recipeIds[index],
        name: r.name,
        instructions: r.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
        nutritionInfo: { servings: r.servings, source: NUTRITION_SOURCE_PENDING },
        source: RecipeSource.System,
        approvalStatus: ApprovalStatus.Approved,
        createdBy: null,
      })),
      ['id'],
      ['name', 'instructions', 'nutrition_info', 'source', 'approval_status'],
    );

    // Replace the ingredient lists so edits to the seed data are reflected exactly.
    await manager.delete(RecipeIngredient, { recipeId: In(recipeIds) });
    await upsertRows(
      manager,
      RecipeIngredient,
      RECIPE_SEEDS.flatMap((r, index) =>
        r.ingredients.map((i) => {
          const food = must(foods, i.food);
          return {
            id: seedId('recipe-ingredient', `${r.name}#${i.food}`),
            recipeId: recipeIds[index],
            foodId: food.id,
            ingredientName: food.name,
            categoryId: food.categoryId,
            quantity: i.quantity,
            unitId: must(units, i.unit).id,
          };
        }),
      ),
      ['id'],
      [],
    );
  },
};
