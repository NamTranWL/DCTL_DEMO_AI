import { ApprovalStatus, normalizeFoodName, type NutritionInfo, RecipeSource } from '@dctl/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
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
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { type RecipeIngredient } from '../entities/recipe-ingredient.entity';
import { type Recipe } from '../entities/recipe.entity';
import { type RecipeSort } from '../repositories/recipe.repository';

const collapse = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/** Một nguyên liệu khi tạo/sửa công thức: chọn foodId hoặc nhập tên. */
export class RecipeIngredientInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'foods.id (khuyến nghị — để tính nguyên liệu thiếu, BR-10)',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Mã thực phẩm không hợp lệ.' })
  foodId?: string;

  @ApiPropertyOptional({ example: 'Lá lốt', description: 'Bắt buộc khi không có foodId' })
  @ValidateIf((input: RecipeIngredientInput) => !input.foodId)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeFoodName(value) : value,
  )
  @IsString({ message: 'Vui lòng nhập tên nguyên liệu.' })
  @Length(1, 150, { message: 'Tên nguyên liệu dài từ 1 đến 150 ký tự.' })
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Danh mục (khi nhập tên tự do)' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  @ApiProperty({ example: 200 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Số lượng phải là số (tối đa 3 chữ số thập phân).' },
  )
  @Min(0.001, { message: 'Số lượng phải lớn hơn 0.' })
  @Max(100_000, { message: 'Số lượng quá lớn.' })
  quantity!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Vui lòng chọn đơn vị.' })
  unitId!: string;
}

/** Số liệu dinh dưỡng mỗi khẩu phần; bắt buộc ghi nguồn khi có số liệu. */
export class NutritionInput {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  caloriesKcal?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) proteinG?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fatG?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) carbsG?: number;

  @ApiProperty({ example: 'Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng Quốc gia)' })
  @Transform(collapse)
  @IsString({ message: 'Vui lòng ghi nguồn số liệu dinh dưỡng.' })
  @Length(1, 255, { message: 'Nguồn số liệu dài từ 1 đến 255 ký tự.' })
  source!: string;
}

/** Tạo/sửa công thức (người dùng đóng góp hoặc Admin). @uc UC-RCP-01, UC-ADM-02  @fr FR-17, FR-25, FR-26 */
export class UpsertRecipeDto {
  @ApiProperty({ example: 'Canh rau dền' })
  @Transform(collapse)
  @IsString({ message: 'Tên món phải là chuỗi.' })
  @Length(1, 200, { message: 'Tên món dài từ 1 đến 200 ký tự.' })
  name!: string;

  @ApiProperty({
    type: [String],
    example: ['Rau dền nhặt, rửa sạch.', 'Nấu sôi nước, cho rau vào.'],
  })
  @IsArray({ message: 'Các bước chế biến phải là mảng.' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 bước chế biến.' })
  @ArrayMaxSize(30, { message: 'Tối đa 30 bước chế biến.' })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((step) => collapse({ value: step })) : value,
  )
  @IsString({ each: true, message: 'Mỗi bước phải là chuỗi.' })
  @Length(1, 1000, { each: true, message: 'Mỗi bước dài từ 1 đến 1000 ký tự.' })
  steps!: string[];

  @ApiProperty({ example: 4, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt({ message: 'Số khẩu phần phải là số nguyên.' })
  @Min(1, { message: 'Số khẩu phần từ 1 đến 50.' })
  @Max(50, { message: 'Số khẩu phần từ 1 đến 50.' })
  servings!: number;

  @ApiPropertyOptional({ type: NutritionInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => NutritionInput)
  nutrition?: NutritionInput;

  @ApiProperty({ type: [RecipeIngredientInput] })
  @IsArray({ message: 'Nguyên liệu phải là mảng.' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 nguyên liệu.' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 nguyên liệu.' })
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInput)
  ingredients!: RecipeIngredientInput[];
}

const RECIPE_SORTS: readonly RecipeSort[] = ['name', 'popular', 'newest'];

/** Tìm/lọc công thức. `sort=popular` xếp theo lượt yêu thích (món phổ biến, FR-17). */
export class ListRecipesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tên món, không phân biệt dấu' })
  @IsOptional()
  @IsString({ message: 'Từ khoá phải là chuỗi.' })
  @MaxLength(100, { message: 'Từ khoá tối đa 100 ký tự.' })
  q?: string;

  @ApiPropertyOptional({ enum: RECIPE_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(RECIPE_SORTS, { message: 'Kiểu sắp xếp không hợp lệ.' })
  sort: RecipeSort = 'name';
}

export class AdminRecipesQueryDto extends ListRecipesQueryDto {
  @ApiPropertyOptional({ enum: ApprovalStatus })
  @IsOptional()
  @IsEnum(ApprovalStatus, { message: 'Trạng thái duyệt không hợp lệ.' })
  status?: ApprovalStatus;
}

export class RecipeIngredientResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) foodId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) categoryId!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty({ format: 'uuid' }) unitId!: string;
  @ApiPropertyOptional() unitSymbol?: string;

  static from(ingredient: RecipeIngredient): RecipeIngredientResponse {
    return Object.assign(new RecipeIngredientResponse(), {
      id: ingredient.id,
      foodId: ingredient.foodId,
      name: ingredient.ingredientName,
      categoryId: ingredient.categoryId,
      quantity: ingredient.quantity,
      unitId: ingredient.unitId,
      ...(ingredient.unit ? { unitSymbol: ingredient.unit.symbol } : {}),
    });
  }
}

/** Tách instructions đã lưu ("1. …\n2. …") thành mảng bước. */
export function parseSteps(instructions: string): string[] {
  return instructions
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/** Ghép các bước thành instructions có đánh số. */
export function formatSteps(steps: readonly string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
}

export class RecipeSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() servings!: number;
  @ApiProperty({ enum: RecipeSource }) source!: RecipeSource;
  @ApiProperty({ enum: ApprovalStatus }) approvalStatus!: ApprovalStatus;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) createdBy!: string | null;
  @ApiProperty({ description: 'Số lượt yêu thích (món phổ biến — FR-17)' }) favoriteCount!: number;
  @ApiProperty() isFavorite!: boolean;
  @ApiProperty() createdAt!: Date;

  static from(recipe: Recipe, favoriteCount: number, isFavorite: boolean): RecipeSummaryResponse {
    return Object.assign(new RecipeSummaryResponse(), {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.nutritionInfo?.servings ?? 1,
      source: recipe.source,
      approvalStatus: recipe.approvalStatus,
      createdBy: recipe.createdBy,
      favoriteCount,
      isFavorite,
      createdAt: recipe.createdAt,
    });
  }
}

export class RecipeDetailResponse extends RecipeSummaryResponse {
  @ApiProperty({ type: [String] }) steps!: string[];
  @ApiProperty({ nullable: true, type: Object }) nutrition!: NutritionInfo | null;
  @ApiProperty({ type: [RecipeIngredientResponse] }) ingredients!: RecipeIngredientResponse[];

  static fromDetail(
    recipe: Recipe,
    favoriteCount: number,
    isFavorite: boolean,
  ): RecipeDetailResponse {
    return Object.assign(
      new RecipeDetailResponse(),
      RecipeSummaryResponse.from(recipe, favoriteCount, isFavorite),
      {
        steps: parseSteps(recipe.instructions),
        nutrition: recipe.nutritionInfo,
        ingredients: (recipe.ingredients ?? []).map((i) => RecipeIngredientResponse.from(i)),
      },
    );
  }
}
