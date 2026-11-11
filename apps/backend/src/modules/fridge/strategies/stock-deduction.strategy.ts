import { InsufficientStockException } from '../../../common/exceptions/domain.exceptions';
import { type IsoDate } from '../../../common/utils/date.util';
import {
  type ConvertibleUnit,
  QUANTITY_SCALE,
  UnitConverter,
} from '../../master-data/units/unit-converter';

/** The lot fields a deduction strategy needs (a FridgeItem with its unit satisfies this). */
export interface StockLot {
  id: string;
  quantity: number;
  unit: ConvertibleUnit;
  expiryDate: IsoDate;
  createdAt: Date;
}

/** How much to take, expressed in the requested unit. */
export interface DeductionRequest {
  quantity: number;
  unit: ConvertibleUnit;
}

/** Amount to take from one lot, in the LOT's unit. */
export interface Allocation {
  lotId: string;
  quantity: number;
}

/** DI token of the active StockDeductionStrategy (FridgeModule binds FefoDeductionStrategy). */
export const STOCK_DEDUCTION_STRATEGY = 'STOCK_DEDUCTION_STRATEGY';

/**
 * Chiến lược chọn lô để trừ kho (Strategy pattern, §10). Hàm thuần — không I/O — để kiểm thử
 * bảng FEFO/BVA độc lập với CSDL.
 * @uc UC-FRIDGE-03  @fr FR-13  @br BR-03
 */
export interface StockDeductionStrategy {
  /** Chọn lô và lượng trừ; không đủ hàng → InsufficientStockException (tồn không âm). */
  allocate(lots: readonly StockLot[], request: DeductionRequest, today: IsoDate): Allocation[];
}

function round(value: number): number {
  const factor = 10 ** QUANTITY_SCALE;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * FEFO — hết hạn trước dùng trước (BR-03):
 * - chỉ dùng lô còn hàng, CÒN HẠN (expiry_date > hôm nay, BR-01) và đơn vị cùng nhóm với đơn vị
 *   yêu cầu (BR-04); lô hết hạn phải huỷ hoặc được chọn đích danh (quyết định B7);
 * - thứ tự: hạn sớm nhất trước, cùng hạn thì lô nhập trước (FIFO), rồi theo id cho ổn định;
 * - quy đổi qua đơn vị gốc của nhóm; tổng không đủ → 409 FRIDGE_INSUFFICIENT_STOCK, không trừ gì.
 * @uc UC-FRIDGE-03  @fr FR-13  @br BR-01, BR-03, BR-04
 */
export class FefoDeductionStrategy implements StockDeductionStrategy {
  /**
   * Phân bổ lượng cần dùng vào các lô theo FEFO.
   * @uc UC-FRIDGE-03  @fr FR-13  @br BR-03
   */
  allocate(lots: readonly StockLot[], request: DeductionRequest, today: IsoDate): Allocation[] {
    const usable = lots
      .filter(
        (lot) =>
          lot.quantity > 0 &&
          lot.expiryDate > today &&
          UnitConverter.canConvert(lot.unit, request.unit),
      )
      .sort(
        (a, b) =>
          a.expiryDate.localeCompare(b.expiryDate) ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );

    let remaining = UnitConverter.toBase(request.quantity, request.unit);
    const allocations: Allocation[] = [];
    for (const lot of usable) {
      if (remaining <= 0) {
        break;
      }
      const available = UnitConverter.toBase(lot.quantity, lot.unit);
      const take = Math.min(remaining, available);
      const inLotUnit =
        take >= available
          ? lot.quantity
          : Math.min(lot.quantity, round(take / lot.unit.factorToBase));
      if (inLotUnit <= 0) {
        // Left-over smaller than the lot unit's precision (0.001): treat as fulfilled.
        remaining = 0;
        break;
      }
      allocations.push({ lotId: lot.id, quantity: inLotUnit });
      remaining = round(remaining - take);
    }

    if (remaining > 0) {
      const availableBase = usable.reduce(
        (sum, lot) => sum + UnitConverter.toBase(lot.quantity, lot.unit),
        0,
      );
      throw new InsufficientStockException({
        requested: request.quantity,
        available: round(availableBase / request.unit.factorToBase),
        unitId: request.unit.id,
        unitSymbol: request.unit.symbol,
      });
    }
    return allocations;
  }
}
