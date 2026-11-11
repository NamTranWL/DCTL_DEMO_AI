import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { Unit } from './entities/unit.entity';
import { type UnitRepository } from './repositories/unit.repository';
import { UnitsService } from './units.service';

function unit(id: string, baseUnitId: string | null, factorToBase = 1): Unit {
  return Object.assign(new Unit(), { id, symbol: id, name: id, baseUnitId, factorToBase });
}

function setup(units: Unit[], usage = 0, derived = 0) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const repo = {
    findOneBy: jest.fn(({ id }: { id: string }) => Promise.resolve(byId.get(id) ?? null)),
    create: (data: Partial<Unit>) => Object.assign(new Unit(), data),
    save: jest.fn((u: Unit) => Promise.resolve(u)),
    countDerived: jest.fn(() => Promise.resolve(derived)),
    countUsages: jest.fn(() =>
      Promise.resolve({ fridgeItems: usage, shoppingListItems: 0, recipeIngredients: 0 }),
    ),
  };
  return { service: new UnitsService(repo as unknown as UnitRepository), repo };
}

async function expectCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

const g = unit('g', null);
const kg = unit('kg', 'g', 1000);
const ml = unit('ml', null);

describe('UnitsService.create — BR-04 single-level groups', () => {
  it('creates a base unit with factor 1', async () => {
    const { service } = setup([]);

    await expect(service.create({ symbol: 'hũ', name: 'hũ' })).resolves.toMatchObject({
      baseUnitId: null,
      factorToBase: 1,
    });
  });

  it('a base unit cannot have a factor other than 1', async () => {
    const { service } = setup([]);

    await expectCode(
      service.create({ symbol: 'x', name: 'x', factorToBase: 5 }),
      ErrorCode.InvalidBaseUnit,
    );
  });

  it('creates a derived unit pointing at a base unit', async () => {
    const { service } = setup([g]);

    await expect(
      service.create({ symbol: 'lạng', name: 'lạng', baseUnitId: 'g', factorToBase: 100 }),
    ).resolves.toMatchObject({ baseUnitId: 'g', factorToBase: 100 });
  });

  it('refuses a derived unit as base (no chains) and a missing factor', async () => {
    const { service } = setup([g, kg]);

    await expectCode(
      service.create({ symbol: 'tấn', name: 'tấn', baseUnitId: 'kg', factorToBase: 1000 }),
      ErrorCode.InvalidBaseUnit,
    );
    await expectCode(
      service.create({ symbol: 'lạng', name: 'lạng', baseUnitId: 'g' }),
      ErrorCode.InvalidBaseUnit,
    );
  });
});

describe('UnitsService.update', () => {
  it('blocks changing the factor of a unit in use', async () => {
    const { service } = setup([g, unit('kg', 'g', 1000)], 3);

    await expectCode(service.update('kg', { factorToBase: 100 }), ErrorCode.MasterDataInUse);
  });

  it('allows renaming a unit in use', async () => {
    const { service } = setup([g, unit('kg', 'g', 1000)], 3);

    await expect(service.update('kg', { name: 'kí lô' })).resolves.toMatchObject({ name: 'kí lô' });
  });

  it('a base unit with derived units cannot become derived', async () => {
    const { service } = setup([unit('g', null), unit('ml', null)], 0, 2);

    await expectCode(
      service.update('g', { baseUnitId: 'ml', factorToBase: 1 }),
      ErrorCode.UnitHasDerived,
    );
  });
});

describe('UnitsService.convert', () => {
  it('converts within a group and refuses across groups', async () => {
    const { service } = setup([g, kg, ml]);

    await expect(service.convert(1.5, 'kg', 'g')).resolves.toBe(1500);
    await expectCode(service.convert(1, 'g', 'ml'), ErrorCode.UnitIncompatible);
  });
});
