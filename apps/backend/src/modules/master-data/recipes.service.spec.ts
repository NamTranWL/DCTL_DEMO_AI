import { ApprovalStatus } from '@dctl/shared';
import { type EventEmitter2 } from '@nestjs/event-emitter';
import { type DataSource } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type CategoriesService } from './categories.service';
import { formatSteps, parseSteps, type UpsertRecipeDto } from './dto/recipe.dto';
import { Food } from './entities/food.entity';
import { Recipe } from './entities/recipe.entity';
import { Unit } from './entities/unit.entity';
import { type FoodsService } from './foods.service';
import { type FavoriteRecipeRepository } from './repositories/favorite-recipe.repository';
import { type RecipeRepository } from './repositories/recipe.repository';
import { RecipesService } from './recipes.service';
import { type UnitsService } from './units.service';

const shrimp = Object.assign(new Food(), { id: 'food-shrimp', name: 'Tôm', categoryId: 'cat-sea' });
const gram = Object.assign(new Unit(), {
  id: 'unit-g',
  symbol: 'g',
  baseUnitId: null,
  factorToBase: 1,
});

function setup(existing: Recipe | null = null, visible = true) {
  const savedIngredients: unknown[] = [];
  const ingredientRepo = {
    delete: jest.fn(),
    create: (data: object) => data,
    save: jest.fn((rows: unknown[]) => {
      savedIngredients.push(...rows);
      return Promise.resolve(rows);
    }),
  };
  const recipeRepo = {
    withManager: () => recipeRepo,
    create: (data: Partial<Recipe>) => Object.assign(new Recipe(), data),
    save: jest.fn((r: Recipe) => Promise.resolve(Object.assign(r, { id: r.id ?? 'new-recipe' }))),
    findOneBy: jest.fn(() => Promise.resolve(existing)),
    findOneByOrFail: jest.fn(() => Promise.resolve(existing)),
    isVisibleTo: jest.fn(() => Promise.resolve(visible)),
    findWithIngredients: jest.fn(() =>
      Promise.resolve(
        Object.assign(new Recipe(), {
          id: 'new-recipe',
          name: 'x',
          instructions: '1. a',
          nutritionInfo: { servings: 2, source: 's' },
          ingredients: [],
        }),
      ),
    ),
  };
  const dataSource = {
    transaction: (work: (m: unknown) => Promise<unknown>) =>
      work({ getRepository: () => ingredientRepo }),
  };
  const favorites = {
    countForRecipe: jest.fn(() => Promise.resolve(0)),
    favoritedIds: jest.fn(() => Promise.resolve(new Set<string>())),
  };
  const foods = {
    findUsable: jest.fn((_f: string | null, ids: readonly string[]) =>
      Promise.resolve(ids.includes(shrimp.id) ? [shrimp] : []),
    ),
    findUsableByNames: jest.fn((_f: string | null, names: readonly string[]) =>
      Promise.resolve(names.includes('Tôm') ? [shrimp] : []),
    ),
  };
  const units = {
    findMany: jest.fn((ids: readonly string[]) =>
      Promise.resolve(ids.includes(gram.id) ? [gram] : []),
    ),
  };
  const categories = { exists: jest.fn(() => Promise.resolve(true)) };
  const events = { emit: jest.fn() };
  const service = new RecipesService(
    dataSource as unknown as DataSource,
    recipeRepo as unknown as RecipeRepository,
    favorites as unknown as FavoriteRecipeRepository,
    foods as unknown as FoodsService,
    units as unknown as UnitsService,
    categories as unknown as CategoriesService,
    events as unknown as EventEmitter2,
  );
  return { service, recipeRepo, savedIngredients, events };
}

const viewer = { userId: 'u1', familyId: 'fam-a' };

function dto(ingredients: UpsertRecipeDto['ingredients']): UpsertRecipeDto {
  return { name: 'Tôm rang', steps: ['Rửa tôm', 'Rang'], servings: 2, ingredients };
}

async function expectCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

describe('RecipesService.contribute — BR-08, BR-10', () => {
  it('creates a USER recipe in PENDING with a pending-source nutrition note', async () => {
    const { service, recipeRepo, events } = setup();

    await service.contribute(viewer, dto([{ foodId: shrimp.id, quantity: 200, unitId: gram.id }]));

    const saved = recipeRepo.save.mock.calls[0]?.[0];
    expect(saved).toMatchObject({ approvalStatus: ApprovalStatus.Pending, createdBy: 'u1' });
    expect(saved?.instructions).toBe('1. Rửa tôm\n2. Rang');
    expect(saved?.nutritionInfo?.source).toMatch(/Chưa cập nhật/);
    expect(events.emit).toHaveBeenCalled();
  });

  it('links a free-text ingredient to the matching food (server computes missing items — BR-10)', async () => {
    const { service, savedIngredients } = setup();

    await service.contribute(viewer, dto([{ name: 'Tôm', quantity: 200, unitId: gram.id }]));

    expect(savedIngredients[0]).toMatchObject({
      foodId: shrimp.id,
      ingredientName: 'Tôm',
      categoryId: 'cat-sea',
    });
  });

  it('keeps an unknown free-text ingredient with food_id NULL', async () => {
    const { service, savedIngredients } = setup();

    await service.contribute(viewer, dto([{ name: 'Lá lốt', quantity: 5, unitId: gram.id }]));

    expect(savedIngredients[0]).toMatchObject({ foodId: null, ingredientName: 'Lá lốt' });
  });

  it('refuses a food the family cannot use (e.g. another family’s PENDING)', async () => {
    const { service } = setup();

    await expectCode(
      service.contribute(viewer, dto([{ foodId: 'food-other', quantity: 1, unitId: gram.id }])),
      ErrorCode.FoodNotAvailable,
    );
  });

  it('refuses the same food twice (by id and by name)', async () => {
    const { service } = setup();

    await expectCode(
      service.contribute(
        viewer,
        dto([
          { foodId: shrimp.id, quantity: 1, unitId: gram.id },
          { name: 'Tôm', quantity: 2, unitId: gram.id },
        ]),
      ),
      ErrorCode.DuplicateIngredient,
    );
  });

  it('refuses an unknown unit', async () => {
    const { service } = setup();

    await expectCode(
      service.contribute(viewer, dto([{ foodId: shrimp.id, quantity: 1, unitId: 'unit-x' }])),
      ErrorCode.ValidationError,
    );
  });
});

describe('RecipesService.updateOwn / deleteOwn', () => {
  const recipe = (status: ApprovalStatus, createdBy = 'u1') =>
    Object.assign(new Recipe(), { id: 'r1', approvalStatus: status, createdBy });

  it('the contributor can edit while PENDING', async () => {
    const { service } = setup(recipe(ApprovalStatus.Pending));

    await expect(
      service.updateOwn(viewer, 'r1', dto([{ foodId: shrimp.id, quantity: 1, unitId: gram.id }])),
    ).resolves.toBeDefined();
  });

  it('nobody but the contributor can edit, and not after approval', async () => {
    const input = dto([{ foodId: shrimp.id, quantity: 1, unitId: gram.id }]);

    await expectCode(
      setup(recipe(ApprovalStatus.Pending, 'someone-else')).service.updateOwn(viewer, 'r1', input),
      ErrorCode.RecipeNotEditable,
    );
    await expectCode(
      setup(recipe(ApprovalStatus.Approved)).service.updateOwn(viewer, 'r1', input),
      ErrorCode.RecipeNotEditable,
    );
  });

  it('an invisible recipe is reported as not found', async () => {
    await expectCode(
      setup(recipe(ApprovalStatus.Pending), false).service.deleteOwn(viewer, 'r1'),
      ErrorCode.NotFound,
    );
  });
});

describe('steps formatting', () => {
  it('round-trips numbered instructions', () => {
    const steps = ['Rửa rau', 'Luộc 5 phút'];

    expect(parseSteps(formatSteps(steps))).toEqual(steps);
    expect(parseSteps('1. A\n\n2.  B  \n')).toEqual(['A', 'B']);
  });
});
