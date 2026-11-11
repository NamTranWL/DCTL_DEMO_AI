import { type AllergyEntry } from '@dctl/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { type DietaryProfile } from '../entities/dietary-profile.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/** Một chất/thực phẩm gây dị ứng. */
export class AllergyEntryDto implements AllergyEntry {
  @ApiPropertyOptional({ format: 'uuid', description: 'foods.id nếu chọn từ danh mục chuẩn' })
  @IsOptional()
  @IsUUID('all', { message: 'Mã thực phẩm không hợp lệ.' })
  foodId?: string;

  @ApiProperty({ example: 'Tôm' })
  @Transform(trim)
  @IsString({ message: 'Tên chất gây dị ứng phải là chuỗi.' })
  @Length(1, 150, { message: 'Tên chất gây dị ứng dài từ 1 đến 150 ký tự.' })
  name!: string;
}

/** Tạo mới hoặc thay toàn bộ hồ sơ ăn uống (PUT). @uc UC-FAM-02  @fr FR-02 */
export class UpsertDietaryProfileDto {
  @ApiProperty({ type: [AllergyEntryDto] })
  @IsArray({ message: 'Danh sách dị ứng phải là mảng.' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 mục dị ứng.' })
  @ValidateNested({ each: true })
  @Type(() => AllergyEntryDto)
  allergies!: AllergyEntryDto[];

  @ApiProperty({ type: [String], example: ['ít cay'] })
  @IsArray({ message: 'Khẩu vị phải là mảng.' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 mục khẩu vị.' })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((v) => trim({ value: v })) : value,
  )
  @IsString({ each: true, message: 'Mỗi khẩu vị phải là chuỗi.' })
  @Length(1, 50, { each: true, message: 'Mỗi khẩu vị dài từ 1 đến 50 ký tự.' })
  tastePreferences!: string[];

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Giảm tinh bột' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Mục tiêu dinh dưỡng phải là chuỗi.' })
  @MaxLength(255, { message: 'Mục tiêu dinh dưỡng tối đa 255 ký tự.' })
  nutritionGoal?: string | null;
}

/** Hồ sơ ăn uống trả về cho client. */
export class DietaryProfileResponse {
  @ApiProperty({ type: [AllergyEntryDto] })
  allergies!: AllergyEntry[];

  @ApiProperty({ type: [String] })
  tastePreferences!: string[];

  @ApiProperty({ nullable: true, type: String })
  nutritionGoal!: string | null;

  @ApiProperty({ nullable: true, type: Date, description: 'null khi chưa thiết lập hồ sơ' })
  updatedAt!: Date | null;

  static from(profile: DietaryProfile | null): DietaryProfileResponse {
    return Object.assign(new DietaryProfileResponse(), {
      allergies: profile?.allergies ?? [],
      tastePreferences: profile?.tastePreferences ?? [],
      nutritionGoal: profile?.nutritionGoal ?? null,
      updatedAt: profile?.updatedAt ?? null,
    });
  }
}
