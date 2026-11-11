import { ApprovalStatus } from '@dctl/shared';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { CatalogItemResolver } from './catalog-item.resolver';
import { type CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { Food } from './entities/food.entity';
import { Unit } from './entities/unit.entity';
import { type FoodsService } from './foods.service';
import { type UnitsService } from './units.service';

const FAMILY = 'family-a';
const VEG = Object.assign(new Category(), { id: 'veg', name: 'Củ quả' });
const DRY = Object.assign(new Category(), { id: 'dry', name: 'Đồ khô' });
const KG = Object.assign(new Unit(), { id: 'kg', symbol: 'kg' });
const TOMATO = Object.assign(new Food(), {
  id: 'tomato',
  name: 'Cà chua',
  categoryId: VEG.id,
  approvalStatus: ApprovalStatus.Approved,
});

function setup() {
  const foods = {
    findUsable: jest.fn((_f: string, ids: string[]) =>
      Promise.resolve(ids.includes(TOMATO.id) ? [TOMATO] : []),
    ),
    findUsableByNames: jest.fn((_f: string, names: string[]) =>
      Promise.resolve(names.includes(TOMATO.name) ? [TOMATO] : []),
    ),
  };
  const categories = {
    findMany: jest.fn((ids: string[]) =>
      Promise.resolve([VEG, DRY].filter((c) => ids.includes(c.id))),
    ),
  };
  const units = {
    findMany: jest.fn((ids: string[]) => Promise.resolve([KG].filter((u) => ids.includes(u.id)))),
  };
  const resolver = new CatalogItemResolver(
    foods as unknown as FoodsService,
    categories as unknown as CategoriesService,
    units as unknown as UnitsService,
  );
  return { resolver, foods };
}

describe('CatalogItemResolver (BR-04)', () => {
  it('foodId → standard name and the food category (or an explicit one)', async () => {
    const { resolver } = setup();

    const [byFood, overridden] = await resolver.resolve(FAMILY, [
      { foodId: TOMATO.id, unitId: KG.id },
      { foodId: TOMATO.id, categoryId: DRY.id, unitId: KG.id },
    ]);

    expect(byFood).toMatchObject({ foodId: TOMATO.id, name: 'Cà chua', categoryId: VEG.id });
    expect(overridden?.categoryId).toBe(DRY.id);
  });

  it('a free name equal to a usable food is linked to it; otherwise stays free text', async () => {
    const { resolver } = setup();

    const [linked, free] = await resolver.resolve(FAMILY, [
      { name: 'Cà chua', unitId: KG.id },
      { name: 'Bánh mì', categoryId: DRY.id, unitId: KG.id },
    ]);

    expect(linked).toMatchObject({ foodId: TOMATO.id, categoryId: VEG.id });
    expect(free).toMatchObject({ foodId: null, name: 'Bánh mì', categoryId: DRY.id, unit: KG });
  });

  it('a food the family may not use → 400 FOOD_NOT_AVAILABLE', async () => {
    const { resolver } = setup();

    await expect(
      resolver.resolve(FAMILY, [{ foodId: 'pending-of-other-family', unitId: KG.id }]),
    ).rejects.toMatchObject({
      code: ErrorCode.FoodNotAvailable,
      details: { foodIds: ['pending-of-other-family'] },
    });
  });

  it('reports missing name/category and unknown category/unit by position', async () => {
    const { resolver } = setup();

    await expect(resolver.resolve(FAMILY, [{ unitId: KG.id }])).rejects.toMatchObject({
      code: ErrorCode.ValidationError,
      details: [
        expect.objectContaining({ field: 'items.0.name' }),
        expect.objectContaining({ field: 'items.0.categoryId' }),
      ],
    });
    await expect(
      resolver.resolve(
        FAMILY,
        [
          { name: 'A', categoryId: VEG.id, unitId: KG.id },
          { name: 'B', categoryId: 'nope', unitId: 'nope' },
        ],
        'lines',
      ),
    ).rejects.toMatchObject({
      details: [
        expect.objectContaining({ field: 'lines.1.categoryId' }),
        expect.objectContaining({ field: 'lines.1.unitId' }),
      ],
    });
  });
});
