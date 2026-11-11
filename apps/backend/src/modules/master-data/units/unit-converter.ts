import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

/** The unit fields the converter needs (a `Unit` entity satisfies this). */
export interface ConvertibleUnit {
  id: string;
  symbol: string;
  baseUnitId: string | null;
  factorToBase: number;
}

/** Quantities are stored as numeric(12,3) — round results to the same scale. */
export const QUANTITY_SCALE = 3;

/** Thrown when two units belong to different groups (e.g. g → ml, kg → quả). @br BR-04 */
export class IncompatibleUnitsException extends AppException {
  constructor(from: ConvertibleUnit, to: ConvertibleUnit) {
    super(
      ErrorCode.UnitIncompatible,
      `Không thể quy đổi từ "${from.symbol}" sang "${to.symbol}" vì khác nhóm đơn vị.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { from: from.symbol, to: to.symbol },
    );
  }
}

function round(value: number): number {
  const factor = 10 ** QUANTITY_SCALE;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Quy đổi số lượng giữa các đơn vị CÙNG NHÓM (cùng đơn vị gốc): g ↔ kg, ml ↔ l ↔ thìa canh.
 * Khác nhóm → IncompatibleUnitsException (422 UNIT_INCOMPATIBLE). Pure — no I/O; used by
 * UnitsService, FridgeService (B7: FEFO across units) and the AI module (B9: missing amounts).
 * @uc UC-FRIDGE-03, UC-AI-01  @fr FR-13, FR-19  @br BR-04
 */
export class UnitConverter {
  /** Id of the base unit of the unit's group (itself for a base unit). */
  static groupOf(unit: ConvertibleUnit): string {
    return unit.baseUnitId ?? unit.id;
  }

  /** Hai đơn vị có quy đổi được cho nhau không. @br BR-04 */
  static canConvert(from: ConvertibleUnit, to: ConvertibleUnit): boolean {
    return UnitConverter.groupOf(from) === UnitConverter.groupOf(to);
  }

  /** Quy đổi `quantity` từ `from` sang `to`, làm tròn 3 chữ số thập phân. @br BR-04 */
  static convert(quantity: number, from: ConvertibleUnit, to: ConvertibleUnit): number {
    if (!UnitConverter.canConvert(from, to)) {
      throw new IncompatibleUnitsException(from, to);
    }
    if (from.id === to.id) {
      return round(quantity);
    }
    return round((quantity * from.factorToBase) / to.factorToBase);
  }

  /** Quy đổi về đơn vị gốc của nhóm (để cộng/so sánh các lô khác đơn vị). @br BR-04 */
  static toBase(quantity: number, unit: ConvertibleUnit): number {
    return round(quantity * unit.factorToBase);
  }
}
