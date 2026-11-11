import { UserRole } from '@dctl/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../../common/decorators/auth.decorators';
import { uuidParam } from '../../../common/pipes/uuid.pipe';
import { type AuthUser } from '../../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../../config/swagger.config';
import { AdminFoodResponse, RejectDto } from '../dto/food.dto';
import { RecipeDetailResponse } from '../dto/recipe.dto';
import { FoodsService } from '../foods.service';
import { RecipesService } from '../recipes.service';

const ID = uuidParam('id');

export class ModerationSummaryResponse {
  @ApiProperty({ description: 'Số tên thực phẩm chờ duyệt' }) pendingFoods!: number;
  @ApiProperty({ description: 'Số công thức chờ duyệt' }) pendingRecipes!: number;
}

/**
 * Admin kiểm duyệt nội dung người dùng đóng góp: tên thực phẩm mới và công thức.
 * Danh sách chờ duyệt: GET /admin/foods?status=PENDING, GET /admin/recipes?status=PENDING.
 * @uc UC-ADM-03  @fr FR-26  @br BR-08
 */
@ApiTags(ApiTag.Admin)
@ApiBearerAuth(BEARER_AUTH)
@Roles(UserRole.Admin)
@Controller('admin/moderation')
export class ModerationAdminController {
  constructor(
    private readonly foodsService: FoodsService,
    private readonly recipesService: RecipesService,
  ) {}

  /** Số nội dung đang chờ duyệt. @uc UC-ADM-03  @fr FR-26 */
  @Get('summary')
  @ApiOkResponse({ type: ModerationSummaryResponse })
  async summary(): Promise<ModerationSummaryResponse> {
    const [pendingFoods, pendingRecipes] = await Promise.all([
      this.foodsService.countPending(),
      this.recipesService.countPending(),
    ]);
    return { pendingFoods, pendingRecipes };
  }

  /** Duyệt tên thực phẩm. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  @Post('foods/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminFoodResponse })
  async approveFood(
    @CurrentUser() admin: AuthUser,
    @Param('id', ID) id: string,
  ): Promise<AdminFoodResponse> {
    return AdminFoodResponse.fromAdmin(await this.foodsService.approve(admin.id, id));
  }

  /** Từ chối tên thực phẩm. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  @Post('foods/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminFoodResponse })
  async rejectFood(
    @CurrentUser() admin: AuthUser,
    @Param('id', ID) id: string,
    @Body() dto: RejectDto,
  ): Promise<AdminFoodResponse> {
    return AdminFoodResponse.fromAdmin(await this.foodsService.reject(admin.id, id, dto.reason));
  }

  /** Duyệt công thức. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  @Post('recipes/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RecipeDetailResponse })
  approveRecipe(
    @CurrentUser() admin: AuthUser,
    @Param('id', ID) id: string,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.approve(admin.id, id);
  }

  /** Từ chối công thức. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  @Post('recipes/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RecipeDetailResponse })
  rejectRecipe(
    @CurrentUser() admin: AuthUser,
    @Param('id', ID) id: string,
    @Body() dto: RejectDto,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.reject(admin.id, id, dto.reason);
  }
}
