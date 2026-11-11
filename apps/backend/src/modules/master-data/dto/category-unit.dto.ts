import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { type Category } from '../entities/category.entity';
import { type Unit } from '../entities/unit.entity';

const collapse = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

// ---------------------------------------------------------------- categories

/** Tạo danh mục. @uc UC-ADM-02  @fr FR-25 */
export class CreateCategoryDto {
  @ApiProperty({ example: 'Rau lá' })
  @Transform(collapse)
  @IsString({ message: 'Tên danh mục phải là chuỗi.' })
  @Length(1, 100, { message: 'Tên danh mục dài từ 1 đến 100 ký tự.' })
  name!: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Để ngăn mát, dùng trong 3 ngày.' })
  @IsOptional()
  @Transform(collapse)
  @IsString({ message: 'Gợi ý bảo quản phải là chuỗi.' })
  @MaxLength(1000, { message: 'Gợi ý bảo quản tối đa 1000 ký tự.' })
  storageAdvice?: string | null;

  @ApiProperty({ example: 3, minimum: 0, maximum: 3650 })
  @Type(() => Number)
  @IsInt({ message: 'Hạn dùng mặc định phải là số nguyên (ngày).' })
  @Min(0, { message: 'Hạn dùng mặc định không được âm.' })
  @Max(3650, { message: 'Hạn dùng mặc định tối đa 3650 ngày.' })
  defaultShelfLifeDays!: number;
}

/** Sửa danh mục (các trường đều tuỳ chọn). @uc UC-ADM-02  @fr FR-25 */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) storageAdvice!: string | null;
  @ApiProperty() defaultShelfLifeDays!: number;

  static from(category: Category): CategoryResponse {
    return Object.assign(new CategoryResponse(), {
      id: category.id,
      name: category.name,
      storageAdvice: category.storageAdvice,
      defaultShelfLifeDays: category.defaultShelfLifeDays,
    });
  }
}

// ---------------------------------------------------------------- units

/**
 * Tạo đơn vị. Không có baseUnitId → đơn vị gốc (factorToBase = 1);
 * có baseUnitId → đơn vị dẫn xuất, factorToBase = số đơn vị gốc trong 1 đơn vị này.
 * @uc UC-ADM-02  @fr FR-25  @br BR-04
 */
export class CreateUnitDto {
  @ApiProperty({ example: 'kg' })
  @Transform(collapse)
  @IsString({ message: 'Ký hiệu đơn vị phải là chuỗi.' })
  @Length(1, 20, { message: 'Ký hiệu đơn vị dài từ 1 đến 20 ký tự.' })
  symbol!: string;

  @ApiProperty({ example: 'ki-lô-gam' })
  @Transform(collapse)
  @IsString({ message: 'Tên đơn vị phải là chuỗi.' })
  @Length(1, 50, { message: 'Tên đơn vị dài từ 1 đến 50 ký tự.' })
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsUUID('all', { message: 'Đơn vị gốc không hợp lệ.' })
  baseUnitId?: string | null;

  @ApiPropertyOptional({ example: 1000, description: 'Bắt buộc khi có baseUnitId' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 6 },
    { message: 'Hệ số quy đổi phải là số (tối đa 6 chữ số thập phân).' },
  )
  @Min(0.000001, { message: 'Hệ số quy đổi phải lớn hơn 0.' })
  @Max(1_000_000, { message: 'Hệ số quy đổi quá lớn.' })
  factorToBase?: number;
}

/** Sửa đơn vị. @uc UC-ADM-02  @fr FR-25  @br BR-04 */
export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

export class UnitResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) baseUnitId!: string | null;
  @ApiProperty() factorToBase!: number;
  @ApiProperty({ format: 'uuid', description: 'Nhóm quy đổi (= id đơn vị gốc)' }) groupId!: string;

  static from(unit: Unit): UnitResponse {
    return Object.assign(new UnitResponse(), {
      id: unit.id,
      symbol: unit.symbol,
      name: unit.name,
      baseUnitId: unit.baseUnitId,
      factorToBase: unit.factorToBase,
      groupId: unit.groupId,
    });
  }
}

/** Quy đổi số lượng. @br BR-04 */
export class ConvertUnitQueryDto {
  @ApiProperty({ example: 1.5 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Số lượng phải là số.' })
  @Min(0, { message: 'Số lượng không được âm.' })
  quantity!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Đơn vị nguồn không hợp lệ.' })
  fromUnitId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Đơn vị đích không hợp lệ.' })
  toUnitId!: string;
}

export class ConvertUnitResponse {
  @ApiProperty() quantity!: number;
  @ApiProperty() fromUnit!: string;
  @ApiProperty() toUnit!: string;
  @ApiProperty() result!: number;
}
