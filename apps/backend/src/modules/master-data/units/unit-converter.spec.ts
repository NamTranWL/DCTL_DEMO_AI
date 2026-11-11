import { ErrorCode } from '../../../common/exceptions/error-code.enum';
import { type ConvertibleUnit, IncompatibleUnitsException, UnitConverter } from './unit-converter';

const unit = (id: string, baseUnitId: string | null, factorToBase = 1): ConvertibleUnit => ({
  id,
  symbol: id,
  baseUnitId,
  factorToBase,
});

const g = unit('g', null);
const kg = unit('kg', 'g', 1000);
const ml = unit('ml', null);
const l = unit('l', 'ml', 1000);
const tbsp = unit('thìa canh', 'ml', 15);
const tsp = unit('thìa cà phê', 'ml', 5);
const qua = unit('quả', null);
const hop = unit('hộp', null);

describe('UnitConverter — BR-04 (only within the same group)', () => {
  it.each([
    [1.5, kg, g, 1500],
    [250, g, kg, 0.25],
    [2, l, ml, 2000],
    [1, tbsp, tsp, 3],
    [3, tsp, tbsp, 1],
    [1, l, tbsp, 66.667],
    [7, qua, qua, 7],
  ])('%p %s → %s = %p', (quantity, from, to, expected) => {
    expect(UnitConverter.convert(quantity, from, to)).toBe(expected);
  });

  it.each([
    [g, ml],
    [kg, l],
    [kg, qua],
    [qua, hop],
  ])('refuses %s → %s with UNIT_INCOMPATIBLE', (from, to) => {
    expect(() => UnitConverter.convert(1, from, to)).toThrow(IncompatibleUnitsException);
    try {
      UnitConverter.convert(1, from, to);
    } catch (error) {
      expect((error as IncompatibleUnitsException).code).toBe(ErrorCode.UnitIncompatible);
      expect((error as IncompatibleUnitsException).message).toContain(from.symbol);
    }
  });

  it('groups base and derived units together', () => {
    expect(UnitConverter.groupOf(kg)).toBe('g');
    expect(UnitConverter.groupOf(g)).toBe('g');
    expect(UnitConverter.canConvert(tbsp, l)).toBe(true);
  });

  it('converts to the base unit and rounds to 3 decimals', () => {
    expect(UnitConverter.toBase(0.3333, kg)).toBe(333.3);
    expect(UnitConverter.convert(0.1 + 0.2, kg, g)).toBe(300);
  });
});
