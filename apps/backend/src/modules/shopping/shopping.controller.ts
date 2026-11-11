import { UserRole } from '@dctl/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  AddShoppingItemDto,
  AssignShoppingItemDto,
  CompleteTripDto,
  CompleteTripResponse,
  CreateShoppingListDto,
  ItemVersionDto,
  ListShoppingListsQueryDto,
  ShoppingItemResponse,
  ShoppingListDetailResponse,
  ShoppingListResponse,
  UpdateShoppingItemDto,
  UpdateShoppingListDto,
} from './dto/shopping.dto';
import { ShoppingService } from './shopping.service';

const LIST_ID = uuidParam('listId', 'Mã danh sách không hợp lệ.');
const ITEM_ID = uuidParam('itemId', 'Mã mặt hàng không hợp lệ.');

/**
 * Danh sách mua sắm của gia đình đang đăng nhập (family_id từ phiên — BR-06).
 * Phân quyền theo actor UC (quyết định B7): người nội trợ lập/sửa/xoá danh sách, thêm/sửa/xoá
 * mặt hàng, phân công (UC-SHOP-01); mọi thành viên xem (UC-SHOP-02), đánh dấu/hoàn tác đã mua
 * và hoàn tất chuyến đi chợ (UC-SHOP-03).
 * @uc UC-SHOP-01, UC-SHOP-02, UC-SHOP-03  @fr FR-03, FR-04, FR-05, FR-06, FR-07, FR-08  @br BR-02, BR-04, BR-06
 */
@ApiTags(ApiTag.Shopping)
@ApiBearerAuth(BEARER_AUTH)
@RequireFamily()
@Controller('shopping-lists')
export class ShoppingController {
  constructor(private readonly shoppingService: ShoppingService) {}

  /** Lập danh sách theo ngày/tuần. @uc UC-SHOP-01  @fr FR-04, FR-06 */
  @Post()
  @Roles(UserRole.Homemaker)
  @ApiCreatedResponse({ type: ShoppingListDetailResponse })
  create(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Body() dto: CreateShoppingListDto,
  ): Promise<ShoppingListDetailResponse> {
    return this.shoppingService.createList(familyId, user.id, dto);
  }

  /** Các danh sách của gia đình (lọc trạng thái, khoảng ngày). @uc UC-SHOP-02  @fr FR-04 */
  @Get()
  @ApiOkResponse({ type: [ShoppingListResponse], description: '{ data, meta } phân trang' })
  list(
    @CurrentFamilyId() familyId: string,
    @Query() query: ListShoppingListsQueryDto,
  ): Promise<Paged<ShoppingListResponse>> {
    return this.shoppingService.listLists(familyId, query);
  }

  /** Xem danh sách kèm mặt hàng (gom theo danh mục). @uc UC-SHOP-02  @fr FR-05, FR-06 */
  @Get(':listId')
  @ApiOkResponse({ type: ShoppingListDetailResponse })
  get(
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
  ): Promise<ShoppingListDetailResponse> {
    return this.shoppingService.getList(familyId, listId);
  }

  /** Đổi ngày/kỳ. @uc UC-SHOP-01  @fr FR-04 */
  @Patch(':listId')
  @Roles(UserRole.Homemaker)
  @ApiOkResponse({ type: ShoppingListResponse })
  update(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Body() dto: UpdateShoppingListDto,
  ): Promise<ShoppingListResponse> {
    return this.shoppingService.updateList(familyId, user.id, listId, dto);
  }

  /** Xoá danh sách chưa hoàn tất. @uc UC-SHOP-01 */
  @Delete(':listId')
  @Roles(UserRole.Homemaker)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
  ): Promise<void> {
    return this.shoppingService.deleteList(familyId, user.id, listId);
  }

  /** Thêm mặt hàng. @uc UC-SHOP-01  @fr FR-03, FR-05  @br BR-04 */
  @Post(':listId/items')
  @Roles(UserRole.Homemaker)
  @ApiCreatedResponse({ type: ShoppingItemResponse })
  addItem(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Body() dto: AddShoppingItemDto,
  ): Promise<ShoppingItemResponse> {
    return this.shoppingService.addItem(familyId, user.id, listId, dto);
  }

  /** Sửa mặt hàng chưa mua (gửi version). @uc UC-SHOP-01  @fr FR-05 */
  @Patch(':listId/items/:itemId')
  @Roles(UserRole.Homemaker)
  @ApiOkResponse({ type: ShoppingItemResponse })
  updateItem(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Param('itemId', ITEM_ID) itemId: string,
    @Body() dto: UpdateShoppingItemDto,
  ): Promise<ShoppingItemResponse> {
    return this.shoppingService.updateItem(familyId, user.id, listId, itemId, dto);
  }

  /** Xoá mặt hàng chưa mua. @uc UC-SHOP-01 */
  @Delete(':listId/items/:itemId')
  @Roles(UserRole.Homemaker)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeItem(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Param('itemId', ITEM_ID) itemId: string,
  ): Promise<void> {
    return this.shoppingService.removeItem(familyId, user.id, listId, itemId);
  }

  /** Phân công / bỏ phân công thành viên. @uc UC-SHOP-01  @fr FR-03 */
  @Put(':listId/items/:itemId/assignee')
  @Roles(UserRole.Homemaker)
  @ApiOkResponse({ type: ShoppingItemResponse })
  assign(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Param('itemId', ITEM_ID) itemId: string,
    @Body() dto: AssignShoppingItemDto,
  ): Promise<ShoppingItemResponse> {
    return this.shoppingService.assignItem(familyId, user.id, listId, itemId, dto);
  }

  /** Đánh dấu "Đã mua" (một thao tác). @uc UC-SHOP-03  @fr FR-07 */
  @Post(':listId/items/:itemId/purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ShoppingItemResponse })
  purchase(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Param('itemId', ITEM_ID) itemId: string,
    @Body() dto: ItemVersionDto,
  ): Promise<ShoppingItemResponse> {
    return this.shoppingService.markAsPurchased(familyId, user.id, listId, itemId, dto);
  }

  /** Hoàn tác "Đã mua". @uc UC-SHOP-03  @fr FR-07 */
  @Post(':listId/items/:itemId/unpurchase')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ShoppingItemResponse })
  unpurchase(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Param('itemId', ITEM_ID) itemId: string,
    @Body() dto: ItemVersionDto,
  ): Promise<ShoppingItemResponse> {
    return this.shoppingService.unmarkPurchased(familyId, user.id, listId, itemId, dto);
  }

  /** "Hoàn tất chuyến đi chợ" → tự nhập kho. @uc UC-SHOP-03  @fr FR-08  @br BR-02 */
  @Post(':listId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CompleteTripResponse })
  complete(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('listId', LIST_ID) listId: string,
    @Body() dto: CompleteTripDto,
  ): Promise<CompleteTripResponse> {
    return this.shoppingService.completeTrip(familyId, user.id, listId, dto);
  }
}
