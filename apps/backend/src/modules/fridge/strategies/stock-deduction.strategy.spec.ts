import { InsufficientStockException } from '../../../common/exceptions/domain.exceptions';
import { addDays } from '../../../common/utils/date.util';
import { type ConvertibleUnit } from '../../master-data/units/unit-converter';
import { FefoDeductionStrategy, type StockLot } from './stock-deduction.strategy';

const TODAY = '2026-11-11';
const G: ConvertibleUnit = { id: 'g', symbol: 'g', baseUnitId: null, factorToBase: 1 };
const KG: ConvertibleUnit = { id: 'kg', symbol: 'kg', baseUnitId: 'g', factorToBase: 1000 };
const PIECE: ConvertibleUnit = { id: 'qua', symbol: 'quả', baseUnitId: null, factorToBase: 1 };

/** Run `fn`, expect an InsufficientStockException and return its details. */
function insufficient(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(InsufficientStockException);
    return (error as InsufficientStockException).details;
  }
  throw new Error('expected InsufficientStockException');
}

let seq = 0;
function lot(
  id: string,
  quantity: number,
  daysLeft: number,
  unit: ConvertibleUnit = KG,
  createdAt = new Date(Date.UTC(2026, 10, 1, 0, seq++)),
): StockLot {
  return { id, quantity, unit, expiryDate: addDays(TODAY, daysLeft), createdAt };
}

describe('FefoDeductionStrategy (BR-03: FEFO, tồn không âm)', () => {
  const fefo = new FefoDeductionStrategy();

  it('takes from the lot that expires first', () => {
    const lots = [lot('late', 1, 6), lot('early', 1, 2), lot('mid', 1, 4)];

    expect(fefo.allocate(lots, { quantity: 0.5, unit: KG }, TODAY)).toEqual([
      { lotId: 'early', quantity: 0.5 },
    ]);
  });

  it('spills over into the next lot when the first one is not enough', () => {
    const lots = [lot('late', 1, 6), lot('early', 0.4, 2)];

    expect(fefo.allocate(lots, { quantity: 1, unit: KG }, TODAY)).toEqual([
      { lotId: 'early', quantity: 0.4 },
      { lotId: 'late', quantity: 0.6 },
    ]);
  });

  it('same expiry → the lot added first is used first (FIFO), then by id', () => {
    const older = lot('b-older', 1, 3, KG, new Date('2026-11-01T00:00:00Z'));
    const newer = lot('a-newer', 1, 3, KG, new Date('2026-11-05T00:00:00Z'));
    const twinA = lot('a-twin', 1, 5, KG, new Date('2026-11-01T00:00:00Z'));
    const twinB = lot('b-twin', 1, 5, KG, new Date('2026-11-01T00:00:00Z'));

    expect(fefo.allocate([newer, older], { quantity: 1, unit: KG }, TODAY)).toEqual([
      { lotId: 'b-older', quantity: 1 },
    ]);
    expect(fefo.allocate([twinB, twinA], { quantity: 1.5, unit: KG }, TODAY)).toEqual([
      { lotId: 'a-twin', quantity: 1 },
      { lotId: 'b-twin', quantity: 0.5 },
    ]);
  });

  describe('expiry boundary (BR-01: hết hạn khi còn ≤ 0 ngày)', () => {
    it.each([
      [-1, false],
      [0, false],
      [1, true],
    ])('lot with %i day(s) left usable = %s', (daysLeft, usable) => {
      const lots = [lot('x', 1, daysLeft)];
      const take = () => fefo.allocate(lots, { quantity: 0.1, unit: KG }, TODAY);

      if (usable) {
        expect(take()).toEqual([{ lotId: 'x', quantity: 0.1 }]);
      } else {
        expect(take).toThrow(InsufficientStockException);
      }
    });

    it('skips expired lots even when they expire first', () => {
      const lots = [lot('expired', 5, -2), lot('today', 5, 0), lot('fresh', 1, 3)];

      expect(fefo.allocate(lots, { quantity: 1, unit: KG }, TODAY)).toEqual([
        { lotId: 'fresh', quantity: 1 },
      ]);
    });
  });

  describe('quantity boundary (BVA on the total available = 1 kg)', () => {
    const lots = () => [lot('a', 0.6, 2), lot('b', 0.4, 3)];

    it('requested = available − 0.001 → ok', () => {
      expect(fefo.allocate(lots(), { quantity: 0.999, unit: KG }, TODAY)).toEqual([
        { lotId: 'a', quantity: 0.6 },
        { lotId: 'b', quantity: 0.399 },
      ]);
    });

    it('requested = available → takes everything', () => {
      expect(fefo.allocate(lots(), { quantity: 1, unit: KG }, TODAY)).toEqual([
        { lotId: 'a', quantity: 0.6 },
        { lotId: 'b', quantity: 0.4 },
      ]);
    });

    it('requested = available + 0.001 → insufficient, reports what is available', () => {
      expect(
        insufficient(() => fefo.allocate(lots(), { quantity: 1.001, unit: KG }, TODAY)),
      ).toEqual({ requested: 1.001, available: 1, unitId: 'kg', unitSymbol: 'kg' });
    });

    it('no lot at all → insufficient with available 0', () => {
      expect(insufficient(() => fefo.allocate([], { quantity: 1, unit: KG }, TODAY))).toMatchObject(
        {
          available: 0,
        },
      );
    });
  });

  describe('units (BR-04: quy đổi trong cùng nhóm)', () => {
    it('converts a request in g against lots in kg and g', () => {
      const lots = [lot('kg-lot', 0.5, 2, KG), lot('g-lot', 300, 4, G)];

      expect(fefo.allocate(lots, { quantity: 700, unit: G }, TODAY)).toEqual([
        { lotId: 'kg-lot', quantity: 0.5 },
        { lotId: 'g-lot', quantity: 200 },
      ]);
    });

    it('ignores lots of another unit group and reports availability in the request unit', () => {
      const lots = [lot('pieces', 10, 2, PIECE), lot('kg-lot', 0.2, 3, KG)];

      expect(
        insufficient(() => fefo.allocate(lots, { quantity: 300, unit: G }, TODAY)),
      ).toMatchObject({
        available: 200,
        unitSymbol: 'g',
      });
    });

    it('treats a left-over below 0.001 of the lot unit as fulfilled', () => {
      const lots = [lot('kg-lot', 1, 2, KG)];

      expect(fefo.allocate(lots, { quantity: 0.4, unit: G }, TODAY)).toEqual([]);
    });
  });

  it('ignores empty lots', () => {
    const lots = [lot('empty', 0, 1), lot('full', 1, 2)];

    expect(fefo.allocate(lots, { quantity: 1, unit: KG }, TODAY)).toEqual([
      { lotId: 'full', quantity: 1 },
    ]);
  });
});
