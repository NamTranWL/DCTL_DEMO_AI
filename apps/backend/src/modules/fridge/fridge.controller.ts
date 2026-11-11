import { UserRole } from '@dctl/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentFamilyId,
  CurrentUser,
  RequireFamily,
  Roles,
} from '../../common/decorators/auth.decorators';
import { type Paged } from '../../common/interceptors/transform.interceptor';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import { type AuthUser } from '../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../config/swagger.config';
import {
  AddFridgeItemsDto,
  ConsumeItemsDto,
  DiscardItemsDto,
  FridgeItemDetailResponse,
  FridgeItemResponse,
  SearchFridgeItemsQueryDto,
  StockChangeResponse,
  UpdateFridgeItemDto,
} from './dto/fridge.dto';
import { FridgeService } from './fridge.service';

const FRIDGE_ITEM_ID = uuidParam('id', 'Mã lô thực phẩm không hợp lệ.');

/**
 * Kho thực phẩm của gia đình đang đăng nhập (family_id từ phiên — BR-06).
 * Xem/tìm: mọi thành viên (UC-FRIDGE-02). Nhập, sửa, ghi dùng/huỷ: người nội trợ
 * (UC-FRIDGE-01, UC-FRIDGE-03 — quyết định B7 "đúng actor UC").
 * @uc UC-FRIDGE-01, UC-FRIDGE-02, UC-FRIDGE-03  @fr FR-09, FR-11, FR-12, FR-13  @br BR-03, BR-06
 */
@ApiTags(ApiTag.Fridge)
@ApiBearerAuth(BEARER_AUTH)
@RequireFamily()
@Controller('fridge')
export class FridgeController {
  constructor(private readonly fridgeService: FridgeService) {}

  /** Tìm thực phẩm trong kho theo tên/danh mục/trạng thái hạn. @uc UC-FRIDGE-02  @fr FR-12 */
  @Get('items')
  @ApiOkResponse({ type: [FridgeItemResponse], description: '{ data, meta } phân trang' })
  search(
    @CurrentFamilyId() familyId: string,
    @Query() query: SearchFridgeItemsQueryDto,
  ): Promise<Paged<FridgeItemResponse>> {
    return this.fridgeService.search(familyId, query);
  }

  /** Chi tiết một lô và lịch sử nhập/dùng/huỷ. @uc UC-FRIDGE-02  @fr FR-13 */
  @Get('items/:id')
  @ApiOkResponse({ type: FridgeItemDetailResponse })
  get(
    @CurrentFamilyId() familyId: string,
    @Param('id', FRIDGE_ITEM_ID) id: string,
  ): Promise<FridgeItemDetailResponse> {
    return this.fridgeService.getDetail(familyId, id);
  }

  /** Nhập kho thủ công (hạn mặc định theo danh mục). @uc UC-FRIDGE-01  @fr FR-09  @br BR-02, BR-04 */
  @Post('items')
  @Roles(UserRole.Homemaker)
  @ApiCreatedResponse({ type: [FridgeItemResponse] })
  add(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Body() dto: AddFridgeItemsDto,
  ): Promise<FridgeItemResponse[]> {
    return this.fridgeService.addManualItems(familyId, user.id, dto);
  }

  /** Sửa hạn dùng / vị trí / giá. @uc UC-FRIDGE-01  @fr FR-09  @br BR-02 */
  @Patch('items/:id')
  @Roles(UserRole.Homemaker)
  @ApiOkResponse({ type: FridgeItemResponse })
  update(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('id', FRIDGE_ITEM_ID) id: string,
    @Body() dto: UpdateFridgeItemDto,
  ): Promise<FridgeItemResponse> {
    return this.fridgeService.updateItem(familyId, user.id, id, dto);
  }

  /** Ghi nhận sử dụng (FEFO). @uc UC-FRIDGE-03  @fr FR-13  @br BR-03 */
  @Post('consume')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Homemaker)
  @ApiOkResponse({ type: [StockChangeResponse] })
  consume(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Body() dto: ConsumeItemsDto,
  ): Promise<StockChangeResponse[]> {
    return this.fridgeService.consumeItems(familyId, user.id, dto);
  }

  /** Huỷ thực phẩm — ghi lãng phí. @uc UC-FRIDGE-03  @fr FR-13, FR-23  @br BR-05 */
  @Post('discard')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Homemaker)
  @ApiOkResponse({ type: [StockChangeResponse] })
  discard(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Body() dto: DiscardItemsDto,
  ): Promise<StockChangeResponse[]> {
    return this.fridgeService.discardItems(familyId, user.id, dto);
  }
}
