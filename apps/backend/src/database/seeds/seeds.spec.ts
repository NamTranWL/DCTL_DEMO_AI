import { CATEGORY_SEEDS, FOOD_SEEDS, RECIPE_SEEDS, UNIT_SEEDS } from './data/master-data.data';
import { DIETARY_PROFILE_SEEDS, FRIDGE_ITEM_SEEDS } from './data/demo.data';
import { seedId } from './seed.helpers';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('seedId', () => {
  it('is a deterministic RFC 4122 v5 UUID', () => {
    const id = seedId('food', 'Cà chua');

    expect(id).toMatch(UUID_V5);
    expect(seedId('food', 'Cà chua')).toBe(id);
  });

  it('differs by kind and by key', () => {
    expect(seedId('food', 'Cà chua')).not.toBe(seedId('category', 'Cà chua'));
    expect(seedId('food', 'Cà chua')).not.toBe(seedId('food', 'Cà tím'));
  });
});

/** Integrity of the seed data itself — catches typos before they reach the database. */
describe('seed data', () => {
  const foodNames = new Set(FOOD_SEEDS.map((f) => f.name));
  const unitSymbols = new Set(UNIT_SEEDS.map((u) => u.symbol));
  const categoryNames = new Set(CATEGORY_SEEDS.map((c) => c.name));

  it('has at least 50 approved Vietnamese foods with unique names', () => {
    expect(FOOD_SEEDS.length).toBeGreaterThanOrEqual(50);
    expect(foodNames.size).toBe(FOOD_SEEDS.length);
  });

  it('references only existing categories', () => {
    expect(FOOD_SEEDS.filter((f) => !categoryNames.has(f.category))).toEqual([]);
  });

  it('derived units point to an existing base unit with a positive factor', () => {
    for (const unit of UNIT_SEEDS.filter((u) => u.base !== undefined)) {
      expect(unitSymbols.has(unit.base!)).toBe(true);
      expect(unit.factorToBase).toBeGreaterThan(0);
    }
  });

  it('has 10 recipes whose ingredients all map to known foods and units', () => {
    expect(RECIPE_SEEDS).toHaveLength(10);
    for (const recipe of RECIPE_SEEDS) {
      for (const ingredient of recipe.ingredients) {
        expect(foodNames.has(ingredient.food)).toBe(true);
        expect(unitSymbols.has(ingredient.unit)).toBe(true);
        expect(ingredient.quantity).toBeGreaterThan(0);
      }
    }
  });

  it('demo fridge covers the BR-01 boundaries 4, 3, 1, 0, −1 days', () => {
    const offsets = FRIDGE_ITEM_SEEDS.map((i) => i.expiresInDays);

    expect(offsets).toEqual(expect.arrayContaining([4, 3, 1, 0, -1]));
  });

  it('demo allergies refer to known foods (BR-07 test data)', () => {
    const allergens = DIETARY_PROFILE_SEEDS.flatMap((p) => p.allergies);

    expect(allergens.length).toBeGreaterThan(0);
    expect(allergens.filter((name) => !foodNames.has(name))).toEqual([]);
  });
});
