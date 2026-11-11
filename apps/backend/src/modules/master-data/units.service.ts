import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { isForeignKeyViolation, uniqueViolationConstraint } from '../../common/utils/db-error.util';
import { type CreateUnitDto, type UpdateUnitDto } from './dto/category-unit.dto';
import { type Unit } from './entities/unit.entity';
import { totalUsage } from './master-data.types';
import { UnitRepository } from './repositories/unit.repository';
import { UnitConverter } from './units/unit-converter';

/**
 * Quản lý đơn vị tính và quy đổi trong cùng nhóm (g↔kg, ml↔l).
 * Mỗi nhóm có đúng một đơn vị gốc; đơn vị dẫn xuất trỏ thẳng tới đơn vị gốc (không lồng nhiều cấp).
 * @uc UC-ADM-02  @fr FR-25  @br BR-04
 */
@Injectable()
export class UnitsService {
  constructor(private readonly units: UnitRepository) {}

  /** Danh sách đơn vị (mọi người dùng). @fr FR-09 */
  list(): Promise<Unit[]> {
    return this.units.findAllOrdered();
  }

  async getById(id: string): Promise<Unit> {
    const unit = await this.units.findOneBy({ id });
    if (!unit) {
      throw AppException.notFound('Không tìm thấy đơn vị.');
    }
    return unit;
  }

  /** Các đơn vị theo id (thiếu id nào → bỏ qua; người gọi tự kiểm tra). */
  findMany(ids: readonly string[]): Promise<Unit[]> {
    return this.units.findManyByIds(ids);
  }

  /**
   * Quy đổi số lượng giữa hai đơn vị cùng nhóm; khác nhóm → 422 UNIT_INCOMPATIBLE.
   * @uc UC-FRIDGE-03, UC-AI-01  @fr FR-13, FR-19  @br BR-04
   */
  async convert(quantity: number, fromUnitId: string, toUnitId: string): Promise<number> {
    const [from, to] = await Promise.all([this.getById(fromUnitId), this.getById(toUnitId)]);
    return UnitConverter.convert(quantity, from, to);
  }

  /** Admin tạo đơn vị gốc hoặc dẫn xuất. @uc UC-ADM-02  @fr FR-25  @br BR-04 */
  async create(dto: CreateUnitDto): Promise<Unit> {
    const unit = this.units.create({ symbol: dto.symbol, name: dto.name });
    await this.applyGroup(unit, dto.baseUnitId ?? null, dto.factorToBase);
    return this.saveUnique(unit);
  }

  /**
   * Admin sửa đơn vị. Đổi nhóm/hệ số của đơn vị đang được dùng bị chặn (sẽ làm sai lệch
   * số lượng đã lưu trong kho, danh sách mua, công thức).
   * @uc UC-ADM-02  @fr FR-25  @br BR-04
   */
  async update(id: string, dto: UpdateUnitDto): Promise<Unit> {
    const unit = await this.getById(id);
    if (dto.symbol !== undefined) {
      unit.symbol = dto.symbol;
    }
    if (dto.name !== undefined) {
      unit.name = dto.name;
    }

    const nextBase = dto.baseUnitId === undefined ? unit.baseUnitId : dto.baseUnitId;
    const nextFactor = dto.factorToBase ?? (nextBase === null ? 1 : unit.factorToBase);
    const groupChanged = nextBase !== unit.baseUnitId || nextFactor !== unit.factorToBase;
    if (groupChanged) {
      if (totalUsage(await this.units.countUsages(unit.id)) > 0) {
        throw new AppException(
          ErrorCode.MasterDataInUse,
          'Đơn vị đang được dùng nên không thể đổi đơn vị gốc hoặc hệ số quy đổi.',
          HttpStatus.CONFLICT,
        );
      }
      await this.applyGroup(unit, nextBase, nextFactor);
    }
    return this.saveUnique(unit);
  }

  /** Admin xoá đơn vị; đang được dùng hoặc là gốc của đơn vị khác → 409. @uc UC-ADM-02  @fr FR-25 */
  async remove(id: string): Promise<void> {
    await this.getById(id);
    try {
      await this.units.delete({ id });
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        throw new AppException(
          ErrorCode.MasterDataInUse,
          'Đơn vị đang được dùng (hoặc là đơn vị gốc của đơn vị khác) nên không thể xoá.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** Validate and set base unit + factor (single-level groups, BR-04). */
  private async applyGroup(
    unit: Unit,
    baseUnitId: string | null,
    factorToBase: number | undefined,
  ): Promise<void> {
    if (baseUnitId === null) {
      if (factorToBase !== undefined && factorToBase !== 1) {
        throw this.invalidBase('Đơn vị gốc luôn có hệ số quy đổi bằng 1.');
      }
      unit.baseUnitId = null;
      unit.factorToBase = 1;
      return;
    }
    if (unit.id && baseUnitId === unit.id) {
      throw this.invalidBase('Đơn vị không thể là đơn vị gốc của chính nó.');
    }
    const base = await this.units.findOneBy({ id: baseUnitId });
    if (!base || base.baseUnitId !== null) {
      throw this.invalidBase(
        'Đơn vị gốc phải là một đơn vị gốc đang tồn tại (không lồng nhiều cấp).',
      );
    }
    if (unit.id && (await this.units.countDerived(unit.id)) > 0) {
      throw new AppException(ErrorCode.UnitHasDerived, undefined, HttpStatus.CONFLICT);
    }
    if (factorToBase === undefined) {
      throw this.invalidBase('Đơn vị dẫn xuất cần hệ số quy đổi về đơn vị gốc.');
    }
    unit.baseUnitId = base.id;
    unit.factorToBase = factorToBase;
  }

  private invalidBase(message: string): AppException {
    return new AppException(ErrorCode.InvalidBaseUnit, message, HttpStatus.BAD_REQUEST);
  }

  private async saveUnique(unit: Unit): Promise<Unit> {
    try {
      return await this.units.save(unit);
    } catch (error: unknown) {
      if (uniqueViolationConstraint(error) === 'uq_units_symbol') {
        throw new AppException(ErrorCode.UnitSymbolTaken, undefined, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }
}
