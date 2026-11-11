import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CurrentUser } from '../../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { type Paged } from '../../../common/interceptors/transform.interceptor';
import { uuidParam } from '../../../common/pipes/uuid.pipe';
import { type AuthUser } from '../../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../../config/swagger.config';
import {
  ListRecipesQueryDto,
  RecipeDetailResponse,
  RecipeSummaryResponse,
  UpsertRecipeDto,
} from '../dto/recipe.dto';
import { viewerOf } from '../master-data.types';
import { RecipesService } from '../recipes.service';

const RECIPE_ID = uuidParam('id', 'Mã công thức không hợp lệ.');

/**
 * Công thức cho người dùng: tìm, xem chi tiết, lưu yêu thích, đóng góp công thức.
 * Công thức chờ duyệt chỉ người đóng góp và gia đình họ thấy (BR-08).
 * @uc UC-RCP-01  @fr FR-17, FR-26  @br BR-08
 */
@ApiTags(ApiTag.MasterData)
@ApiBearerAuth(BEARER_AUTH)
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  /** Tìm công thức (sort=popular: món phổ biến). @uc UC-RCP-01  @fr FR-17 */
  @Get()
  @ApiOkResponse({ type: [RecipeSummaryResponse], description: '{ data, meta } phân trang' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListRecipesQueryDto,
  ): Promise<Paged<RecipeSummaryResponse>> {
    return this.recipesService.list(viewerOf(user), query);
  }

  /** Công thức yêu thích của tôi. @uc UC-RCP-01  @fr FR-17 */
  @Get('favorites')
  @ApiOkResponse({ type: [RecipeSummaryResponse] })
  listFavorites(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paged<RecipeSummaryResponse>> {
    return this.recipesService.listFavorites(viewerOf(user), query);
  }

  /** Xem công thức và hướng dẫn. @uc UC-RCP-01  @fr FR-17 */
  @Get(':id')
  @ApiOkResponse({ type: RecipeDetailResponse })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', RECIPE_ID) id: string,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.getDetail(viewerOf(user), id);
  }

  /** Đóng góp công thức (chờ Admin duyệt). @uc UC-RCP-01  @fr FR-26  @br BR-08 */
  @Post()
  @ApiCreatedResponse({ type: RecipeDetailResponse })
  contribute(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertRecipeDto,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.contribute(viewerOf(user), dto);
  }

  /** Sửa công thức tôi đóng góp (khi còn chờ duyệt). @uc UC-RCP-01  @fr FR-26 */
  @Put(':id')
  @ApiOkResponse({ type: RecipeDetailResponse })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', RECIPE_ID) id: string,
    @Body() dto: UpsertRecipeDto,
  ): Promise<RecipeDetailResponse> {
    return this.recipesService.updateOwn(viewerOf(user), id, dto);
  }

  /** Xoá công thức tôi đóng góp (chờ duyệt / bị từ chối). @uc UC-RCP-01  @fr FR-26 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthUser, @Param('id', RECIPE_ID) id: string): Promise<void> {
    await this.recipesService.deleteOwn(viewerOf(user), id);
  }

  /** Lưu yêu thích. @uc UC-RCP-01  @fr FR-17 */
  @Post(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async favorite(@CurrentUser() user: AuthUser, @Param('id', RECIPE_ID) id: string): Promise<void> {
    await this.recipesService.addFavorite(viewerOf(user), id);
  }

  /** Bỏ yêu thích. @uc UC-RCP-01  @fr FR-17 */
  @Delete(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async unfavorite(
    @CurrentUser() user: AuthUser,
    @Param('id', RECIPE_ID) id: string,
  ): Promise<void> {
    await this.recipesService.removeFavorite(viewerOf(user), id);
  }
}
