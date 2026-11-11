import { Body, Controller, Get, HttpStatus, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import {
  CurrentFamilyId,
  CurrentUser,
  RequireFamily,
} from '../../../common/decorators/auth.decorators';
import { type AuthUser } from '../../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../../config/swagger.config';
import { CategoriesService } from '../categories.service';
import {
  CategoryResponse,
  ConvertUnitQueryDto,
  ConvertUnitResponse,
  UnitResponse,
} from '../dto/category-unit.dto';
import {
  ContributeFoodDto,
  ContributeFoodResponse,
  FoodResponse,
  SearchFoodsQueryDto,
} from '../dto/food.dto';
import { FoodsService } from '../foods.service';
import { UnitsService } from '../units.service';

/**
 * Tra cứu master data cho người dùng: danh mục, đơn vị, gợi ý tên thực phẩm, đề xuất tên mới.
 * @uc UC-FRIDGE-01, UC-SHOP-01  @fr FR-05, FR-09, FR-11, FR-12, FR-26  @br BR-04, BR-06
 */
@ApiTags(ApiTag.MasterData)
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class CatalogController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly unitsService: UnitsService,
    private readonly foodsService: FoodsService,
  ) {}

  /** Danh mục thực phẩm kèm gợi ý bảo quản. @fr FR-05, FR-11 */
  @Get('categories')
  @ApiOkResponse({ type: [CategoryResponse] })
  async listCategories(): Promise<CategoryResponse[]> {
    return (await this.categoriesService.list()).map((c) => CategoryResponse.from(c));
  }

  /** Đơn vị tính (kèm nhóm quy đổi). @fr FR-09  @br BR-04 */
  @Get('units')
  @ApiOkResponse({ type: [UnitResponse] })
  async listUnits(): Promise<UnitResponse[]> {
    return (await this.unitsService.list()).map((u) => UnitResponse.from(u));
  }

  /** Quy đổi số lượng giữa hai đơn vị cùng nhóm. @br BR-04 */
  @Get('units/convert')
  @ApiOkResponse({ type: ConvertUnitResponse })
  async convert(@Query() query: ConvertUnitQueryDto): Promise<ConvertUnitResponse> {
    const [from, to] = await Promise.all([
      this.unitsService.getById(query.fromUnitId),
      this.unitsService.getById(query.toUnitId),
    ]);
    return {
      quantity: query.quantity,
      fromUnit: from.symbol,
      toUnit: to.symbol,
      result: await this.unitsService.convert(query.quantity, from.id, to.id),
    };
  }

  /**
   * Gợi ý tên thực phẩm (không dấu, không phân biệt hoa thường): APPROVED + tên chờ duyệt
   * của chính gia đình bạn.
   * @uc UC-FRIDGE-01, UC-SHOP-01  @fr FR-09, FR-12  @br BR-04
   */
  @Get('foods/search')
  @ApiOkResponse({ type: [FoodResponse] })
  async searchFoods(
    @CurrentUser() user: AuthUser,
    @Query() query: SearchFoodsQueryDto,
  ): Promise<FoodResponse[]> {
    const foods = await this.foodsService.search(user.familyId, query);
    return foods.map((food) => FoodResponse.from(food, user.familyId));
  }

  /**
   * Đề xuất tên thực phẩm mới (PENDING, dùng được ngay trong gia đình). 201 khi tạo mới,
   * 200 khi trả lại tên đã có; 409 khi tên đang chờ duyệt của gia đình khác hoặc đã bị từ chối.
   * @uc UC-FRIDGE-01  @fr FR-09, FR-26  @br BR-04, BR-08
   */
  @Post('foods')
  @RequireFamily()
  @ApiCreatedResponse({ type: ContributeFoodResponse })
  @ApiOkResponse({ type: ContributeFoodResponse, description: 'Tên đã có — trả lại bản ghi' })
  @ApiConflictResponse({ description: 'FOOD_PENDING_REVIEW / FOOD_REJECTED' })
  async contributeFood(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Body() dto: ContributeFoodDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ContributeFoodResponse> {
    const { food, created } = await this.foodsService.contribute(
      { userId: user.id, familyId },
      dto,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { food: FoodResponse.from(food, familyId), created };
  }
}
