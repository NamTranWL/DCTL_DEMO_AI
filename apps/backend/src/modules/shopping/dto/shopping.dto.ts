import {
  normalizeFoodName,
  PeriodType,
  ShoppingListItemStatus,
  ShoppingListStatus,
  type ShoppingItemSnapshot,
  type ShoppingListSnapshot,
  StorageLocation,
} from '@dctl/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { type IsoDate } from '../../../common/utils/date.util';
import {
  IsIsoDate,
  MAX_MONEY,
  MAX_QUANTITY,
} from '../../../common/validators/is-iso-date.validator';
import { type ShoppingListItem } from '../entities/shopping-list-item.entity';
import { type ShoppingList } from '../entities/shopping-list.entity';
import { type ItemCounts } from '../shopping.types';

/** Max items in one list creation / one trip completion. */
export const MAX_LIST_ITEMS = 100;

const toFoodName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeFoodName(value) : value;

function Quantity(): PropertyDecorator {
  return (target: object, key: string | symbol) => {
    IsNumber(
      { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false },
      { message: 'Số lượng phải là số, tối đa 3 chữ số thập phân.' },
    )(target, key);
    IsPositive({ message: 'Số lượng phải lớn hơn 0.' })(target, key);
    Max(MAX_QUANTITY, { message: 'Số lượng quá lớn.' })(target, key);
  };
}

function Version(): PropertyDecorator {
  return (target: object, key: string | symbol) => {
    ApiProperty({ example: 1, description: 'Version đọc được lần cuối (khoá lạc quan)' })(
      target,
      key,
    );
    IsInt({ message: 'Version phải là số nguyên.' })(target, key);
    Min(1, { message: 'Version không hợp lệ.' })(target, key);
  };
}

/**
 * Một mặt hàng cần mua: chọn thực phẩm chuẩn (foodId) hoặc nhập tên tự do + danh mục (BR-04).
 * @uc UC-SHOP-01  @fr FR-03, FR-05  @br BR-04
 */
export class AddShoppingItemDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID('all', { message: 'Thực phẩm không hợp lệ.' })
  foodId?: string | null;

  @ApiPropertyOptional({ example: 'Cà chua', description: 'Bắt buộc khi không chọn foodId' })
  @IsOptional()
  @Transform(toFoodName)
  @IsString({ message: 'Tên mặt hàng phải là chuỗi.' })
  @Length(1, 150, { message: 'Tên mặt hàng dài từ 1 đến 150 ký tự.' })
  itemName?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Mặc định theo danh mục của thực phẩm' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  @ApiProperty({ example: 0.5, minimum: 0.001 })
  @Quantity()
  expectedQuantity!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Vui lòng chọn đơn vị.' })
  unitId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Thành viên được phân công (FR-03)' })
  @IsOptional()
  @IsUUID('all', { message: 'Thành viên không hợp lệ.' })
  assigneeId?: string;
}

/** Lập danh sách mua sắm theo ngày/tuần. @uc UC-SHOP-01  @fr FR-04, FR-05, FR-06 */
export class CreateShoppingListDto {
  @ApiProperty({
    example: '2026-11-12',
    description: 'Ngày đi chợ (DAY) hoặc ngày đầu tuần (WEEK)',
  })
  @IsIsoDate({ message: 'Ngày đi chợ phải có dạng YYYY-MM-DD.' })
  targetDate!: IsoDate;

  @ApiPropertyOptional({ enum: PeriodType, default: PeriodType.Day })
  @IsOptional()
  @IsEnum(PeriodType, { message: 'Kỳ danh sách phải là DAY hoặc WEEK.' })
  periodType?: PeriodType;

  @ApiPropertyOptional({ type: [AddShoppingItemDto] })
  @IsOptional()
  @IsArray({ message: 'Danh sách mặt hàng không hợp lệ.' })
  @ArrayMaxSize(MAX_LIST_ITEMS, { message: `Tối đa ${MAX_LIST_ITEMS} mặt hàng mỗi danh sách.` })
  @ValidateNested({ each: true })
  @Type(() => AddShoppingItemDto)
  items?: AddShoppingItemDto[];
}

/** Đổi ngày / kỳ của danh sách chưa hoàn tất. @uc UC-SHOP-01  @fr FR-04 */
export class UpdateShoppingListDto {
  @ApiPropertyOptional({ example: '2026-11-13' })
  @IsOptional()
  @IsIsoDate({ message: 'Ngày đi chợ phải có dạng YYYY-MM-DD.' })
  targetDate?: IsoDate;

  @ApiPropertyOptional({ enum: PeriodType })
  @IsOptional()
  @IsEnum(PeriodType, { message: 'Kỳ danh sách phải là DAY hoặc WEEK.' })
  periodType?: PeriodType;
}

/** Bộ lọc lịch sử danh sách. @uc UC-SHOP-02  @fr FR-04, FR-21 */
export class ListShoppingListsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ShoppingListStatus })
  @IsOptional()
  @IsEnum(ShoppingListStatus, { message: 'Trạng thái không hợp lệ.' })
  status?: ShoppingListStatus;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'target_date ≥ from' })
  @IsOptional()
  @IsIsoDate({ message: 'Ngày bắt đầu phải có dạng YYYY-MM-DD.' })
  from?: IsoDate;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'target_date ≤ to' })
  @IsOptional()
  @IsIsoDate({ message: 'Ngày kết thúc phải có dạng YYYY-MM-DD.' })
  to?: IsoDate;
}

/** Sửa mặt hàng chưa mua; gửi kèm version đang có. @uc UC-SHOP-01  @fr FR-05  @br BR-04 */
export class UpdateShoppingItemDto {
  @Version()
  version!: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID('all', { message: 'Thực phẩm không hợp lệ.' })
  foodId?: string | null;

  @ApiPropertyOptional({ example: 'Cà chua bi' })
  @IsOptional()
  @Transform(toFoodName)
  @IsString({ message: 'Tên mặt hàng phải là chuỗi.' })
  @Length(1, 150, { message: 'Tên mặt hàng dài từ 1 đến 150 ký tự.' })
  itemName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Quantity()
  expectedQuantity?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Đơn vị không hợp lệ.' })
  unitId?: string;
}

/** Phân công / bỏ phân công (null). @uc UC-SHOP-01  @fr FR-03 */
export class AssignShoppingItemDto {
  @Version()
  version!: number;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  @ValidateIf((dto: AssignShoppingItemDto) => dto.assigneeId !== null)
  @IsUUID('all', { message: 'Thành viên không hợp lệ (gửi null để bỏ phân công).' })
  assigneeId!: string | null;
}

/** Đánh dấu / hoàn tác "đã mua" bằng một thao tác. @uc UC-SHOP-03  @fr FR-07 */
export class ItemVersionDto {
  @Version()
  version!: number;
}

/**
 * Điều chỉnh khi nhập kho cho một mặt hàng đã mua (BR-02: hạn dùng mặc định theo danh mục,
 * người dùng sửa được; số lượng thực mua; vị trí; giá).
 * @uc UC-SHOP-03, UC-FRIDGE-01  @fr FR-08, FR-09  @br BR-02
 */
export class TripItemOverrideDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Mặt hàng không hợp lệ.' })
  itemId!: string;

  @ApiPropertyOptional({ example: 0.6, description: 'Số lượng thực mua (mặc định = dự kiến)' })
  @IsOptional()
  @Quantity()
  quantity?: number;

  @ApiPropertyOptional({ example: '2026-11-15' })
  @IsOptional()
  @IsIsoDate({ message: 'Hạn dùng phải có dạng YYYY-MM-DD.' })
  expiryDate?: IsoDate;

  @ApiPropertyOptional({ enum: StorageLocation, default: StorageLocation.Fridge })
  @IsOptional()
  @IsEnum(StorageLocation, { message: 'Vị trí lưu trữ không hợp lệ.' })
  storageLocation?: StorageLocation;

  @ApiPropertyOptional({ example: 35000 })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Giá phải là số, tối đa 2 chữ số thập phân.' },
  )
  @Min(0, { message: 'Giá không được âm.' })
  @Max(MAX_MONEY, { message: 'Giá quá lớn.' })
  purchasedPrice?: number;
}

/** "Hoàn tất chuyến đi chợ" — tuỳ chọn điều chỉnh từng mặt hàng. @uc UC-SHOP-03  @fr FR-08 */
export class CompleteTripDto {
  @ApiPropertyOptional({ type: [TripItemOverrideDto] })
  @IsOptional()
  @IsArray({ message: 'Danh sách điều chỉnh không hợp lệ.' })
  @ArrayMaxSize(MAX_LIST_ITEMS, { message: `Tối đa ${MAX_LIST_ITEMS} mặt hàng.` })
  @ValidateNested({ each: true })
  @Type(() => TripItemOverrideDto)
  items?: TripItemOverrideDto[];
}

/** Danh sách mua sắm (không kèm mặt hàng) — cùng dạng với payload realtime. */
export class ShoppingListResponse implements ShoppingListSnapshot {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-11-12' }) targetDate!: string;
  @ApiProperty({ enum: PeriodType }) periodType!: PeriodType;
  @ApiProperty({ enum: ShoppingListStatus }) status!: ShoppingListStatus;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) createdBy!: string | null;
  @ApiProperty() itemCount!: number;
  @ApiProperty() purchasedCount!: number;
  @ApiProperty() updatedAt!: string;

  static from(list: ShoppingList, counts: ItemCounts): ShoppingListResponse {
    return Object.assign(new ShoppingListResponse(), {
      id: list.id,
      targetDate: list.targetDate,
      periodType: list.periodType,
      status: list.status,
      createdBy: list.createdBy,
      itemCount: counts.total,
      purchasedCount: counts.purchased,
      updatedAt: list.updatedAt.toISOString(),
    });
  }
}

/** Một mặt hàng — cùng dạng với payload realtime. */
export class ShoppingItemResponse implements ShoppingItemSnapshot {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) shoppingListId!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) foodId!: string | null;
  @ApiProperty({ example: 'Cà chua' }) itemName!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty({ nullable: true, type: String }) categoryName!: string | null;
  @ApiProperty({ example: 0.5 }) expectedQuantity!: number;
  @ApiProperty({ format: 'uuid' }) unitId!: string;
  @ApiProperty({ nullable: true, type: String, example: 'kg' }) unitSymbol!: string | null;
  @ApiProperty({ enum: ShoppingListItemStatus }) status!: ShoppingListItemStatus;
  @ApiProperty() isPurchased!: boolean;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) assigneeId!: string | null;
  @ApiProperty({ nullable: true, type: String }) assigneeName!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) purchasedBy!: string | null;
  @ApiProperty({ nullable: true, type: String }) purchasedAt!: string | null;
  @ApiProperty({ description: 'Gửi lại khi sửa (409 VERSION_CONFLICT nếu đã cũ)' })
  version!: number;

  static from(item: ShoppingListItem): ShoppingItemResponse {
    return Object.assign(new ShoppingItemResponse(), {
      id: item.id,
      shoppingListId: item.shoppingListId,
      foodId: item.foodId,
      itemName: item.itemName,
      categoryId: item.categoryId,
      categoryName: item.category?.name ?? null,
      expectedQuantity: item.expectedQuantity,
      unitId: item.unitId,
      unitSymbol: item.unit?.symbol ?? null,
      status: item.status,
      isPurchased: item.isPurchased,
      assigneeId: item.assigneeId,
      assigneeName: item.assignee?.username ?? null,
      purchasedBy: item.purchasedBy,
      purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString() : null,
      version: item.version,
    });
  }
}

/** Danh sách kèm mặt hàng (sắp theo danh mục — FR-05). @uc UC-SHOP-02 */
export class ShoppingListDetailResponse extends ShoppingListResponse {
  @ApiProperty({ type: [ShoppingItemResponse] }) items!: ShoppingItemResponse[];
}

/** Kết quả "Hoàn tất chuyến đi chợ" (5.1 bước 8). @uc UC-SHOP-03  @fr FR-08  @br BR-02 */
export class CompleteTripResponse {
  @ApiProperty({ type: ShoppingListResponse }) list!: ShoppingListResponse;
  @ApiProperty({ type: [String], description: 'Mặt hàng đã nhập kho' }) importedItemIds!: string[];
  @ApiProperty({ type: [String], description: 'Lô trong kho đã nhận hàng' })
  fridgeItemIds!: string[];
  @ApiProperty({ description: 'Mặt hàng chưa mua (giữ lại trong danh sách làm lịch sử)' })
  pendingItemCount!: number;
}
