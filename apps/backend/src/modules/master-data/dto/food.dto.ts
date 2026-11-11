import { ApprovalStatus, normalizeFoodName } from '@dctl/shared';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { type Food } from '../entities/food.entity';

const toFoodName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeFoodName(value) : value;

/** Tham số ô gợi ý tên thực phẩm. @uc UC-FRIDGE-01  @fr FR-09  @br BR-04 */
export class SearchFoodsQueryDto {
  @ApiProperty({ example: 'thit ba', description: 'Không phân biệt dấu, hoa thường' })
  @IsString({ message: 'Vui lòng nhập từ khoá.' })
  @Length(1, 100, { message: 'Từ khoá dài từ 1 đến 100 ký tự.' })
  q!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn phải là số nguyên.' })
  @Min(1, { message: 'Giới hạn từ 1 đến 50.' })
  @Max(50, { message: 'Giới hạn từ 1 đến 50.' })
  limit: number = 10;
}

/**
 * Người dùng đề xuất tên thực phẩm mới (→ PENDING, dùng được ngay trong gia đình).
 * Tên được chuẩn hoá bằng normalizeFoodName() trước khi kiểm tra.
 * @uc UC-FRIDGE-01  @fr FR-09, FR-26  @br BR-04, BR-08
 */
export class ContributeFoodDto {
  @ApiProperty({ example: 'Rau dền' })
  @Transform(toFoodName)
  @IsString({ message: 'Tên thực phẩm phải là chuỗi.' })
  @Length(1, 150, { message: 'Tên thực phẩm dài từ 1 đến 150 ký tự.' })
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Vui lòng chọn danh mục.' })
  categoryId!: string;
}

/** Admin tạo thực phẩm chuẩn (APPROVED ngay). @uc UC-ADM-02  @fr FR-25 */
export class CreateFoodDto extends ContributeFoodDto {}

/** Admin sửa tên/danh mục thực phẩm. @uc UC-ADM-02  @fr FR-25 */
export class UpdateFoodDto extends PartialType(CreateFoodDto) {}

/** Admin từ chối nội dung đóng góp (lý do gửi kèm thông báo cho người đóng góp). */
export class RejectDto {
  @ApiPropertyOptional({ example: 'Trùng với "Rau dền đỏ"' })
  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason?: string;
}

/** Bộ lọc danh sách thực phẩm cho Admin. @uc UC-ADM-02, UC-ADM-03 */
export class AdminFoodsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Từ khoá phải là chuỗi.' })
  @MaxLength(100, { message: 'Từ khoá tối đa 100 ký tự.' })
  q?: string;

  @ApiPropertyOptional({ enum: ApprovalStatus })
  @IsOptional()
  @IsEnum(ApprovalStatus, { message: 'Trạng thái duyệt không hợp lệ.' })
  status?: ApprovalStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;
}

export class FoodResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Thịt ba chỉ' }) name!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiPropertyOptional({ example: 'Thịt' }) categoryName?: string;
  @ApiProperty({ enum: ApprovalStatus }) approvalStatus!: ApprovalStatus;
  @ApiProperty({ description: 'true nếu là tên do gia đình bạn đề xuất, đang chờ duyệt' })
  isPendingOwn!: boolean;

  static from(food: Food, viewerFamilyId: string | null = null): FoodResponse {
    return Object.assign(new FoodResponse(), {
      id: food.id,
      name: food.name,
      categoryId: food.categoryId,
      ...(food.category ? { categoryName: food.category.name } : {}),
      approvalStatus: food.approvalStatus,
      isPendingOwn:
        food.approvalStatus === ApprovalStatus.Pending &&
        viewerFamilyId !== null &&
        food.createdByFamilyId === viewerFamilyId,
    });
  }
}

/** Thực phẩm cho Admin: có thêm gia đình đề xuất. */
export class AdminFoodResponse extends FoodResponse {
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) createdByFamilyId!: string | null;
  @ApiProperty() createdAt!: Date;

  static fromAdmin(food: Food): AdminFoodResponse {
    return Object.assign(new AdminFoodResponse(), FoodResponse.from(food), {
      isPendingOwn: false,
      createdByFamilyId: food.createdByFamilyId,
      createdAt: food.createdAt,
    });
  }
}

/** Kết quả đề xuất tên: `created = false` khi trả lại thực phẩm đã có. */
export class ContributeFoodResponse {
  @ApiProperty({ type: FoodResponse }) food!: FoodResponse;
  @ApiProperty() created!: boolean;
}
