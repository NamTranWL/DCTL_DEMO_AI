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
import { CurrentUser, Roles } from '../../../common/decorators/auth.decorators';
import { Paged } from '../../../common/interceptors/transform.interceptor';
import { uuidParam } from '../../../common/pipes/uuid.pipe';
import { type AuthUser } from '../../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../../config/swagger.config';
import { CategoriesService } from '../categories.service';
import {
  CategoryResponse,
  CreateCategoryDto,
  CreateUnitDto,
  UnitResponse,
  UpdateCategoryDto,
  UpdateUnitDto,
} from '../dto/category-unit.dto';
import {
  AdminFoodResponse,
  AdminFoodsQueryDto,
  CreateFoodDto,
  UpdateFoodDto,
} from '../dto/food.dto';
import {
  AdminRecipesQueryDto,
  RecipeDetailResponse,
  RecipeSummaryResponse,
  UpsertRecipeDto,
} from '../dto/recipe.dto';
import { FoodsService } from '../foods.service';
import { RecipesService } from '../recipes.service';
import { UnitsService } from '../units.service';

const ID = uuidParam('id');

/**
 * Admin quản lý master data: danh mục, đơn vị tính, thực phẩm chuẩn, công thức chuẩn.
 * Chỉ vai trò ADMIN (RolesGuard).
 * @uc UC-ADM-02  @fr FR-25  @br BR-04
 */
@ApiTags(ApiTag.Admin)
@ApiBearerAuth(BEARER_AUTH)
@Roles(UserRole.Admin)
@Controller('admin')
export class MasterDataAdminController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly unitsService: UnitsService,
    private readonly foodsService: FoodsService,
    private readonly recipesService: RecipesService,
  ) {}

  // ---------------------------------------------------------------- categories

  /** Thêm danh mục. @uc UC-ADM-02  @fr FR-25 */
  @Post('categories')
  @ApiCreatedResponse({ type: CategoryResponse })
  async createCategory(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return CategoryResponse.from(await this.categoriesService.create(dto));
  }

  /** Sửa danh mục. @uc UC-ADM-02  @fr FR-25 */
  @Patch('categories/:id')
  @ApiOkResponse({ type: CategoryResponse })
  async updateCategory(
    @Param('id', ID) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return CategoryResponse.from(await this.categoriesService.update(id, dto));
  }

  /** Xoá danh mục (409 nếu đang dùng). @uc UC-ADM-02  @fr FR-25 */
  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async removeCategory(@Param('id', ID) id: string): Promise<void> {
    await this.categoriesService.remove(id);
  }

  // ---------------------------------------------------------------- units

  /** Thêm đơn vị (gốc hoặc dẫn xuất). @uc UC-ADM-02  @fr FR-25  @br BR-04 */
  @Post('units')
  @ApiCreatedResponse({ type: UnitResponse })
  async createUnit(@Body() dto: CreateUnitDto): Promise<UnitResponse> {
    return UnitResponse.from(await this.unitsService.create(dto));
  }

  /** Sửa đơn vị (không đổi được nhóm/hệ số khi đang dùng). @uc UC-ADM-02  @fr FR-25  @br BR-04 */
  @Patch('units/:id')
  @ApiOkResponse({ type: UnitResponse })
  async updateUnit(@Param('id', ID) id: string, @Body() dto: UpdateUnitDto): Promise<UnitResponse> {
    return UnitResponse.from(await this.unitsService.update(id, dto));
  }

  /** Xoá đơn vị (409 nếu đang dùng). @uc UC-ADM-02  @fr FR-25 */
  @Delete('units/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async removeUnit(@Param('id', ID) id: string): Promise<void> {
    await this.unitsService.remove(id);
  }

  // ---------------------------------------------------------------- foods

  /** Danh sách thực phẩm (mọi trạng thái, lọc theo status/q/categoryId). @uc UC-ADM-02, UC-ADM-03 */
  @Get('foods')
  @ApiOkResponse({ type: [AdminFoodResponse], description: '{ data, meta } phân trang' })
  async listFoods(@Query() query: AdminFoodsQueryDto): Promise<Paged<AdminFoodResponse>> {
    const [foods, total] = await this.foodsService.listForAdmin(query);
    return new Paged(
      foods.map((food) => AdminFoodResponse.fromAdmin(food)),
      { total, page: query.page, pageSize: query.pageSize },
    );
  }

  /** Thêm thực phẩm chuẩn (APPROVED). @uc UC-ADM-02  @fr FR-25  @br BR-04 */
  @Post('foods')
  @ApiCreatedResponse({ type: AdminFoodResponse })
  async createFood(@Body() dto: CreateFoodDto): Promise<AdminFoodResponse> {
    const food = await this.foodsService.create(dto);
    return AdminFoodResponse.fromAdmin(await this.foodsService.getById(food.id));
  }

  /** Sửa tên/danh mục thực phẩm. @uc UC-ADM-02  @fr FR-25  @br BR-04 */
  @Patch('foods/:id')
  @ApiOkResponse({ type: AdminFoodResponse })
  async updateFood(
    @Param('id', ID) id: string,
    @Body() dto: UpdateFoodDto,
  ): Promise<AdminFoodResponse> {
    return AdminFoodResponse.fromAdmin(await this.foodsService.update(id, dto));
  }

  /** Xoá thực phẩm (409 FOOD_IN_USE nếu đang dùng). @uc UC-ADM-02  @fr FR-25 */
  @Delete('foods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async removeFood(@Param('id', ID) id: string): Promise<void> {
    await this.foodsService.remove(id);
  }

  // ---------------------------------------------------------------- recipes

  /** Danh sách công thức (mọi trạng thái). @uc UC-ADM-02, UC-ADM-03 */
  @Get('recipes')
  @ApiOkResponse({ type: [RecipeSummaryResponse], description: '{ data, meta } phân trang' })
  listRecipes(
    @CurrentUser() admin: AuthUser,
    @Query() query: AdminRecipesQueryDto,
  ): Promise<Paged<RecipeSummaryResponse>> {
    return this.recipesService.listForAdmin(admin.id, query);
  }

  /** Chi tiết công thức. @uc UC-ADM-02, UC-ADM-03 */
  @Get('recipes/:id')
  @ApiOkResponse({ type: RecipeDetailResponse })
  getRecipe(
    @CurrentUser() admin: AuthUser,
    @Param('id', ID) id: string,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.getDetailForAdmin(admin.id, id);
  }

  /** Thêm công thức chuẩn (SYSTEM, APPROVED). @uc UC-ADM-02  @fr FR-25  @br BR-10 */
  @Post('recipes')
  @ApiCreatedResponse({ type: RecipeDetailResponse })
  createRecipe(
    @CurrentUser() admin: AuthUser,
    @Body() dto: UpsertRecipeDto,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.createStandard(admin.id, dto);
  }

  /** Sửa công thức (thay toàn bộ nguyên liệu). @uc UC-ADM-02  @fr FR-25 */
  @Put('recipes/:id')
  @ApiOkResponse({ type: RecipeDetailResponse })
  updateRecipe(
    @CurrentUser() admin: AuthUser,
    @Param('id', ID) id: string,
    @Body() dto: UpsertRecipeDto,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.updateAny(admin.id, id, dto);
  }

  /** Xoá công thức (409 nếu đang trong thực đơn). @uc UC-ADM-02  @fr FR-25 */
  @Delete('recipes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async removeRecipe(@Param('id', ID) id: string): Promise<void> {
    await this.recipesService.removeAny(id);
  }
}
