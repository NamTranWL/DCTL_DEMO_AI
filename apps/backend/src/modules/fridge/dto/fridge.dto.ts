import {
  FridgeItemState,
  InventoryTransactionType,
  normalizeFoodName,
  StorageLocation,
} from '@dctl/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { type IsoDate } from '../../../common/utils/date.util';
import {
  IsIsoDate,
  MAX_MONEY,
  MAX_QUANTITY,
} from '../../../common/validators/is-iso-date.validator';
import { type FridgeItem } from '../entities/fridge-item.entity';
import { type InventoryTransaction } from '../entities/inventory-transaction.entity';

/** Max lines in one add/consume/discard request. */
export const MAX_FRIDGE_LINES = 50;

const toFoodName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeFoodName(value) : value;

const QUANTITY_RULES = [
  IsNumber(
    { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false },
    { message: 'Số lượng phải là số, tối đa 3 chữ số thập phân.' },
  ),
  IsPositive({ message: 'Số lượng phải lớn hơn 0.' }),
  Max(MAX_QUANTITY, { message: 'Số lượng quá lớn.' }),
];

function Quantity(): PropertyDecorator {
  return (target: object, key: string | symbol) => {
    for (const rule of QUANTITY_RULES) {
      rule(target, key);
    }
  };
}

function Price(): PropertyDecorator {
  return (target: object, key: string | symbol) => {
    IsNumber(
      { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
      { message: 'Giá phải là số, tối đa 2 chữ số thập phân.' },
    )(target, key);
    Min(0, { message: 'Giá không được âm.' })(target, key);
    Max(MAX_MONEY, { message: 'Giá quá lớn.' })(target, key);
  };
}

/** Các trạng thái lọc được khi tìm trong kho (chỉ lô còn hàng). */
export const SEARCHABLE_STATES = [
  FridgeItemState.Fresh,
  FridgeItemState.ExpiringSoon,
  FridgeItemState.Expired,
] as const;
export type SearchableState = (typeof SEARCHABLE_STATES)[number];

/**
 * Một lô nhập kho thủ công. Chọn thực phẩm chuẩn (foodId) hoặc nhập tên tự do + danh mục.
 * Không gửi hạn dùng → hạn mặc định theo danh mục (BR-02).
 * @uc UC-FRIDGE-01  @fr FR-09  @br BR-02, BR-04
 */
export class AddFridgeItemDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID('all', { message: 'Thực phẩm không hợp lệ.' })
  foodId?: string | null;

  @ApiPropertyOptional({ example: 'Cà chua', description: 'Bắt buộc khi không chọn foodId' })
  @IsOptional()
  @Transform(toFoodName)
  @IsString({ message: 'Tên thực phẩm phải là chuỗi.' })
  @Length(1, 150, { message: 'Tên thực phẩm dài từ 1 đến 150 ký tự.' })
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Mặc định theo danh mục của thực phẩm' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  @ApiProperty({ example: 0.5, minimum: 0.001 })
  @Quantity()
  quantity!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Vui lòng chọn đơn vị.' })
  unitId!: string;

  @ApiPropertyOptional({ example: '2026-11-15', description: 'Không gửi → mặc định theo danh mục' })
  @IsOptional()
  @IsIsoDate({ message: 'Hạn dùng phải có dạng YYYY-MM-DD.' })
  expiryDate?: IsoDate;

  @ApiPropertyOptional({ enum: StorageLocation, default: StorageLocation.Fridge })
  @IsOptional()
  @IsEnum(StorageLocation, { message: 'Vị trí lưu trữ không hợp lệ.' })
  storageLocation?: StorageLocation;

  @ApiPropertyOptional({ example: 25000, description: 'Giá mua cả lô (VNĐ)' })
  @IsOptional()
  @Price()
  purchasedPrice?: number;
}

/** Nhập kho thủ công nhiều lô một lần. @uc UC-FRIDGE-01  @fr FR-09 */
export class AddFridgeItemsDto {
  @ApiProperty({ type: [AddFridgeItemDto] })
  @IsArray({ message: 'Danh sách thực phẩm không hợp lệ.' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một thực phẩm.' })
  @ArrayMaxSize(MAX_FRIDGE_LINES, { message: `Tối đa ${MAX_FRIDGE_LINES} thực phẩm mỗi lần.` })
  @ValidateNested({ each: true })
  @Type(() => AddFridgeItemDto)
  items!: AddFridgeItemDto[];
}

/** Tìm thực phẩm trong kho theo tên hoặc danh mục. @uc UC-FRIDGE-02  @fr FR-11, FR-12 */
export class SearchFridgeItemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'ca chua', description: 'Không phân biệt dấu, hoa thường' })
  @IsOptional()
  @IsString({ message: 'Từ khoá phải là chuỗi.' })
  @MaxLength(100, { message: 'Từ khoá tối đa 100 ký tự.' })
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Thực phẩm không hợp lệ.' })
  foodId?: string;

  @ApiPropertyOptional({ enum: StorageLocation })
  @IsOptional()
  @IsEnum(StorageLocation, { message: 'Vị trí lưu trữ không hợp lệ.' })
  storageLocation?: StorageLocation;

  @ApiPropertyOptional({ enum: SEARCHABLE_STATES })
  @IsOptional()
  @IsIn(SEARCHABLE_STATES, { message: 'Trạng thái không hợp lệ.' })
  state?: SearchableState;
}

/** Sửa hạn dùng / vị trí / giá của một lô (BR-02: người dùng sửa được hạn). @uc UC-FRIDGE-01 */
export class UpdateFridgeItemDto {
  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @IsIsoDate({ message: 'Hạn dùng phải có dạng YYYY-MM-DD.' })
  expiryDate?: IsoDate;

  @ApiPropertyOptional({ enum: StorageLocation })
  @IsOptional()
  @IsEnum(StorageLocation, { message: 'Vị trí lưu trữ không hợp lệ.' })
  storageLocation?: StorageLocation;

  @ApiPropertyOptional({ example: 25000, nullable: true, type: Number })
  @IsOptional()
  @Price()
  purchasedPrice?: number;
}

/**
 * Một dòng ghi nhận sử dụng: chọn đích danh lô (fridgeItemId) HOẶC thực phẩm (foodId — trừ
 * theo FEFO trên các lô còn hạn). unitId: đơn vị của số lượng (mặc định đơn vị của lô; bắt
 * buộc khi trừ theo foodId).
 * @uc UC-FRIDGE-03  @fr FR-13  @br BR-03, BR-04
 */
export class ConsumeLineDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Lô thực phẩm không hợp lệ.' })
  fridgeItemId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Thực phẩm không hợp lệ.' })
  foodId?: string;

  @ApiProperty({ example: 300, minimum: 0.001 })
  @Quantity()
  quantity!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Đơn vị không hợp lệ.' })
  unitId?: string;
}

/** Ghi nhận sử dụng thực phẩm (khi nấu). @uc UC-FRIDGE-03  @fr FR-13  @br BR-03 */
export class ConsumeItemsDto {
  @ApiProperty({ type: [ConsumeLineDto] })
  @IsArray({ message: 'Danh sách không hợp lệ.' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một dòng.' })
  @ArrayMaxSize(MAX_FRIDGE_LINES, { message: `Tối đa ${MAX_FRIDGE_LINES} dòng mỗi lần.` })
  @ValidateNested({ each: true })
  @Type(() => ConsumeLineDto)
  items!: ConsumeLineDto[];
}

/** Một lô bị huỷ; không gửi quantity → huỷ toàn bộ phần còn lại. @uc UC-FRIDGE-03  @br BR-05 */
export class DiscardLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Lô thực phẩm không hợp lệ.' })
  fridgeItemId!: string;

  @ApiPropertyOptional({ example: 0.2, description: 'Theo đơn vị của lô' })
  @IsOptional()
  @Quantity()
  quantity?: number;
}

/** Huỷ thực phẩm (hết hạn/hỏng) — ghi nhận lãng phí. @uc UC-FRIDGE-03  @fr FR-13  @br BR-05 */
export class DiscardItemsDto {
  @ApiProperty({ type: [DiscardLineDto] })
  @IsArray({ message: 'Danh sách không hợp lệ.' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một dòng.' })
  @ArrayMaxSize(MAX_FRIDGE_LINES, { message: `Tối đa ${MAX_FRIDGE_LINES} dòng mỗi lần.` })
  @ValidateNested({ each: true })
  @Type(() => DiscardLineDto)
  items!: DiscardLineDto[];
}

/** Một lô trong kho, kèm trạng thái hạn tính theo hôm nay (BR-01) và gợi ý bảo quản (FR-11). */
export class FridgeItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) foodId!: string | null;
  @ApiProperty({ example: 'Cà chua' }) name!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty({ nullable: true, type: String }) categoryName!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'FR-11' })
  storageAdvice!: string | null;
  @ApiProperty({ example: 0.5 }) quantity!: number;
  @ApiProperty({ format: 'uuid' }) unitId!: string;
  @ApiProperty({ nullable: true, type: String, example: 'kg' }) unitSymbol!: string | null;
  @ApiProperty({ example: '2026-11-15' }) expiryDate!: string;
  @ApiProperty({ description: 'Âm khi đã quá hạn' }) daysUntilExpiry!: number;
  @ApiProperty({ enum: FridgeItemState }) state!: FridgeItemState;
  @ApiProperty({ enum: StorageLocation }) storageLocation!: StorageLocation;
  @ApiProperty({ nullable: true, type: Number }) purchasedPrice!: number | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(
    item: FridgeItem,
    today: IsoDate,
    lastType?: InventoryTransactionType,
  ): FridgeItemResponse {
    return Object.assign(new FridgeItemResponse(), {
      id: item.id,
      foodId: item.foodId,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.category?.name ?? null,
      storageAdvice: item.category?.storageAdvice ?? null,
      quantity: item.quantity,
      unitId: item.unitId,
      unitSymbol: item.unit?.symbol ?? null,
      expiryDate: item.expiryDate,
      daysUntilExpiry: item.daysUntilExpiry(today),
      state: item.getState(today, lastType),
      storageLocation: item.storageLocation,
      purchasedPrice: item.purchasedPrice,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    });
  }
}

export class InventoryTransactionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: InventoryTransactionType }) type!: InventoryTransactionType;
  @ApiProperty() quantity!: number;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) userId!: string | null;
  @ApiProperty() createdAt!: string;

  static from(txn: InventoryTransaction): InventoryTransactionResponse {
    return Object.assign(new InventoryTransactionResponse(), {
      id: txn.id,
      type: txn.type,
      quantity: txn.quantity,
      userId: txn.userId,
      createdAt: txn.createdAt.toISOString(),
    });
  }
}

/** Một lô kèm lịch sử nhập/dùng/huỷ (để xem chi tiết, kể cả lô đã hết hàng). */
export class FridgeItemDetailResponse extends FridgeItemResponse {
  @ApiProperty({ type: [InventoryTransactionResponse] })
  transactions!: InventoryTransactionResponse[];
}

/** Kết quả trừ kho trên một lô. @br BR-03 */
export class StockChangeResponse {
  @ApiProperty({ format: 'uuid' }) fridgeItemId!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) foodId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Lượng đã trừ, theo đơn vị của lô' }) quantity!: number;
  @ApiProperty({ format: 'uuid' }) unitId!: string;
  @ApiProperty({ description: 'Tồn còn lại của lô' }) remaining!: number;
  @ApiProperty({ enum: FridgeItemState }) state!: FridgeItemState;
}
