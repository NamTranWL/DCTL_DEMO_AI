import { ApprovalStatus, type NutritionInfo, RecipeSource, toSearchKey } from '@dctl/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { Paged } from '../../common/interceptors/transform.interceptor';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CategoriesService } from './categories.service';
import {
  type AdminRecipesQueryDto,
  formatSteps,
  type ListRecipesQueryDto,
  type RecipeIngredientInput,
  RecipeDetailResponse,
  RecipeSummaryResponse,
  type UpsertRecipeDto,
} from './dto/recipe.dto';
import { RecipeIngredient } from './entities/recipe-ingredient.entity';
import { type Recipe } from './entities/recipe.entity';
import {
  RECIPE_APPROVED,
  RECIPE_REJECTED,
  RECIPE_SUBMITTED,
  RecipeReviewedEvent,
  RecipeSubmittedEvent,
} from './events';
import { FoodsService } from './foods.service';
import { NUTRITION_SOURCE_PENDING, type Viewer } from './master-data.types';
import { FavoriteRecipeRepository } from './repositories/favorite-recipe.repository';
import { type RecipeListRow, RecipeRepository } from './repositories/recipe.repository';
import { UnitsService } from './units.service';

/** Ingredient rows ready to insert (without recipeId). */
type IngredientDraft = Pick<
  RecipeIngredient,
  'foodId' | 'ingredientName' | 'categoryId' | 'quantity' | 'unitId'
>;

/** Who edits a recipe: a contributing user (family visibility) or an admin (approved foods only). */
type Author = { kind: 'user'; viewer: Viewer } | { kind: 'admin'; adminId: string };

/**
 * Công thức món ăn: xem, tìm, lưu yêu thích (UC-RCP-01); người dùng đóng góp công thức
 * (PENDING, chỉ người đóng góp và gia đình họ thấy); Admin quản lý công thức chuẩn và kiểm duyệt.
 * @uc UC-RCP-01, UC-ADM-02, UC-ADM-03  @fr FR-17, FR-25, FR-26  @br BR-08, BR-10
 */
@Injectable()
export class RecipesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly recipes: RecipeRepository,
    private readonly favorites: FavoriteRecipeRepository,
    private readonly foodsService: FoodsService,
    private readonly unitsService: UnitsService,
    private readonly categoriesService: CategoriesService,
    private readonly events: EventEmitter2,
  ) {}

  // ------------------------------------------------------------------ viewing (UC-RCP-01)

  /**
   * Danh sách công thức người dùng được xem (APPROVED + đóng góp của gia đình mình).
   * `sort=popular` → món phổ biến theo lượt yêu thích.
   * @uc UC-RCP-01  @fr FR-17  @br BR-08
   */
  async list(viewer: Viewer, query: ListRecipesQueryDto): Promise<Paged<RecipeSummaryResponse>> {
    const [rows, total] = await this.recipes.listVisible(viewer, {
      key: query.q ? toSearchKey(query.q) : undefined,
      sort: query.sort,
      offset: query.offset,
      limit: query.pageSize,
    });
    return this.toPage(viewer.userId, rows, total, query);
  }

  /** Chi tiết công thức (nguyên liệu, các bước, dinh dưỡng); không được xem → 404. @uc UC-RCP-01  @fr FR-17 */
  async getDetail(viewer: Viewer, id: string): Promise<RecipeDetailResponse> {
    if (!(await this.recipes.isVisibleTo(id, viewer))) {
      throw AppException.notFound('Không tìm thấy công thức.');
    }
    return this.detail(id, viewer.userId);
  }

  // ------------------------------------------------------------------ favorites (FR-17)

  /** Lưu công thức yêu thích (gọi lại nhiều lần không lỗi). @uc UC-RCP-01  @fr FR-17 */
  async addFavorite(viewer: Viewer, id: string): Promise<void> {
    if (!(await this.recipes.isVisibleTo(id, viewer))) {
      throw AppException.notFound('Không tìm thấy công thức.');
    }
    await this.favorites.addFavorite(viewer.userId, id);
  }

  /** Bỏ yêu thích. @uc UC-RCP-01  @fr FR-17 */
  async removeFavorite(viewer: Viewer, id: string): Promise<void> {
    await this.favorites.removeFavorite(viewer.userId, id);
  }

  /** Công thức yêu thích của tôi (chỉ những công thức vẫn còn được xem). @uc UC-RCP-01  @fr FR-17 */
  async listFavorites(
    viewer: Viewer,
    query: PaginationQueryDto,
  ): Promise<Paged<RecipeSummaryResponse>> {
    const ids = await this.favorites.recipeIdsOf(viewer.userId);
    const visible = new Map(
      (await this.recipes.findVisibleByIds(ids, viewer)).map((recipe) => [recipe.id, recipe]),
    );
    const orderedIds = ids.filter((id) => visible.has(id));
    const pageIds = orderedIds.slice(query.offset, query.offset + query.pageSize);
    const counts = await this.favorites.countsFor(pageIds);
    const items = pageIds.map((id) =>
      RecipeSummaryResponse.from(visible.get(id) as Recipe, counts.get(id) ?? 0, true),
    );
    return new Paged(items, {
      total: orderedIds.length,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  // ------------------------------------------------------------------ contributions (FR-26)

  /**
   * Người dùng đóng góp công thức → PENDING, nguồn USER; chỉ công khai sau khi Admin duyệt.
   * @uc UC-RCP-01  @fr FR-26  @br BR-08, BR-10
   */
  async contribute(viewer: Viewer, dto: UpsertRecipeDto): Promise<RecipeDetailResponse> {
    const id = await this.save(
      null,
      dto,
      { kind: 'user', viewer },
      {
        source: RecipeSource.User,
        approvalStatus: ApprovalStatus.Pending,
        createdBy: viewer.userId,
      },
    );
    this.events.emit(RECIPE_SUBMITTED, new RecipeSubmittedEvent(id, dto.name, viewer.userId));
    return this.detail(id, viewer.userId);
  }

  /** Người đóng góp sửa công thức của mình khi còn chờ duyệt. @uc UC-RCP-01  @fr FR-26  @br BR-08 */
  async updateOwn(viewer: Viewer, id: string, dto: UpsertRecipeDto): Promise<RecipeDetailResponse> {
    await this.assertEditableByContributor(viewer, id, [ApprovalStatus.Pending]);
    await this.save(id, dto, { kind: 'user', viewer });
    return this.detail(id, viewer.userId);
  }

  /** Người đóng góp xoá công thức của mình (chờ duyệt hoặc bị từ chối). @uc UC-RCP-01  @fr FR-26 */
  async deleteOwn(viewer: Viewer, id: string): Promise<void> {
    await this.assertEditableByContributor(viewer, id, [
      ApprovalStatus.Pending,
      ApprovalStatus.Rejected,
    ]);
    await this.recipes.delete({ id });
  }

  // ------------------------------------------------------------------ admin (UC-ADM-02/03)

  /** Danh sách công thức cho Admin (mọi trạng thái). @uc UC-ADM-02, UC-ADM-03  @fr FR-25, FR-26 */
  async listForAdmin(
    adminId: string,
    query: AdminRecipesQueryDto,
  ): Promise<Paged<RecipeSummaryResponse>> {
    const [rows, total] = await this.recipes.listForAdmin({
      key: query.q ? toSearchKey(query.q) : undefined,
      sort: query.sort,
      status: query.status,
      offset: query.offset,
      limit: query.pageSize,
    });
    return this.toPage(adminId, rows, total, query);
  }

  /** Admin xem chi tiết mọi công thức. @uc UC-ADM-02, UC-ADM-03 */
  async getDetailForAdmin(adminId: string, id: string): Promise<RecipeDetailResponse> {
    return this.detail(id, adminId);
  }

  /** Admin tạo công thức chuẩn (SYSTEM, APPROVED). @uc UC-ADM-02  @fr FR-25  @br BR-10 */
  async createStandard(adminId: string, dto: UpsertRecipeDto): Promise<RecipeDetailResponse> {
    const id = await this.save(
      null,
      dto,
      { kind: 'admin', adminId },
      {
        source: RecipeSource.System,
        approvalStatus: ApprovalStatus.Approved,
        createdBy: null,
      },
    );
    return this.detail(id, adminId);
  }

  /** Admin sửa bất kỳ công thức (giữ nguyên trạng thái duyệt). @uc UC-ADM-02  @fr FR-25 */
  async updateAny(
    adminId: string,
    id: string,
    dto: UpsertRecipeDto,
  ): Promise<RecipeDetailResponse> {
    await this.getOrFail(id);
    await this.save(id, dto, { kind: 'admin', adminId });
    return this.detail(id, adminId);
  }

  /** Admin xoá công thức; đang có trong thực đơn → 409. @uc UC-ADM-02  @fr FR-25 */
  async removeAny(id: string): Promise<void> {
    await this.getOrFail(id);
    if ((await this.recipes.countMealPlanUsages(id)) > 0) {
      throw new AppException(
        ErrorCode.MasterDataInUse,
        'Công thức đang có trong thực đơn nên không thể xoá.',
        HttpStatus.CONFLICT,
      );
    }
    await this.recipes.delete({ id });
  }

  /** Số công thức đang chờ duyệt (bảng điều khiển Admin). @uc UC-ADM-03 */
  countPending(): Promise<number> {
    return this.recipes.countBy({ approvalStatus: ApprovalStatus.Pending });
  }

  /** Admin duyệt công thức đóng góp → công khai. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  async approve(adminId: string, id: string): Promise<RecipeDetailResponse> {
    const recipe = await this.getOrFail(id);
    recipe.approve();
    await this.recipes.save(recipe);
    this.events.emit(
      RECIPE_APPROVED,
      new RecipeReviewedEvent(recipe.id, recipe.name, recipe.createdBy, adminId),
    );
    return this.detail(id, adminId);
  }

  /** Admin từ chối công thức đóng góp (kèm lý do). @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  async reject(adminId: string, id: string, reason?: string): Promise<RecipeDetailResponse> {
    const recipe = await this.getOrFail(id);
    recipe.reject();
    await this.recipes.save(recipe);
    this.events.emit(
      RECIPE_REJECTED,
      new RecipeReviewedEvent(recipe.id, recipe.name, recipe.createdBy, adminId, reason ?? null),
    );
    return this.detail(id, adminId);
  }

  // ------------------------------------------------------------------ internals

  /**
   * Create (id = null) or replace a recipe and its ingredient list in one transaction.
   * Returns the recipe id.
   */
  private async save(
    id: string | null,
    dto: UpsertRecipeDto,
    author: Author,
    initial?: Pick<Recipe, 'source' | 'approvalStatus' | 'createdBy'>,
  ): Promise<string> {
    const ingredients = await this.resolveIngredients(dto.ingredients, author);
    const nutritionInfo: NutritionInfo = {
      servings: dto.servings,
      ...(dto.nutrition ?? {}),
      source: dto.nutrition?.source ?? NUTRITION_SOURCE_PENDING,
    };

    return this.dataSource.transaction(async (manager) => {
      const recipes = this.recipes.withManager(manager);
      const recipe =
        id === null ? recipes.create({ ...initial }) : await recipes.findOneByOrFail({ id });
      recipe.name = dto.name;
      recipe.instructions = formatSteps(dto.steps);
      recipe.nutritionInfo = nutritionInfo;
      recipe.ingredients = undefined;
      const saved = await recipes.save(recipe);

      const ingredientRepo = manager.getRepository(RecipeIngredient);
      await ingredientRepo.delete({ recipeId: saved.id });
      await ingredientRepo.save(
        ingredients.map((draft) => ingredientRepo.create({ ...draft, recipeId: saved.id })),
      );
      return saved.id;
    });
  }

  /**
   * Validate ingredients: foods must be usable by the author (contributor: APPROVED + own family
   * PENDING; admin: APPROVED only), units must exist, no duplicates. Free-text names that match
   * a usable food exactly are linked to it so the server can compute missing items (BR-10).
   */
  private async resolveIngredients(
    inputs: readonly RecipeIngredientInput[],
    author: Author,
  ): Promise<IngredientDraft[]> {
    const familyId = author.kind === 'user' ? author.viewer.familyId : null;
    const foodIds = inputs.flatMap((i) => (i.foodId ? [i.foodId] : []));
    const freeNames = inputs.flatMap((i) => (!i.foodId && i.name ? [i.name] : []));

    const [byId, byName, units] = await Promise.all([
      this.foodsService.findUsable(familyId, foodIds),
      this.foodsService.findUsableByNames(familyId, freeNames),
      this.unitsService.findMany(inputs.map((i) => i.unitId)),
    ]);
    const foodsById = new Map(byId.map((f) => [f.id, f]));
    const foodsByName = new Map(byName.map((f) => [f.name, f]));
    const unitIds = new Set(units.map((u) => u.id));

    const missingFoods = foodIds.filter((fid) => !foodsById.has(fid));
    if (missingFoods.length > 0) {
      throw new AppException(ErrorCode.FoodNotAvailable, undefined, HttpStatus.BAD_REQUEST, {
        foodIds: missingFoods,
      });
    }
    const missingUnits = inputs.filter((i) => !unitIds.has(i.unitId)).map((i) => i.unitId);
    if (missingUnits.length > 0) {
      throw AppException.validation(
        [{ field: 'ingredients.unitId', constraints: { exists: 'Đơn vị không tồn tại.' } }],
        'Đơn vị không tồn tại.',
      );
    }
    await this.assertCategories(inputs.flatMap((i) => (i.categoryId ? [i.categoryId] : [])));

    const seen = new Set<string>();
    return inputs.map((input) => {
      const food = input.foodId ? foodsById.get(input.foodId) : foodsByName.get(input.name ?? '');
      const name = food?.name ?? input.name ?? '';
      const key = food ? `food:${food.id}` : `name:${toSearchKey(name)}`;
      if (seen.has(key)) {
        throw new AppException(ErrorCode.DuplicateIngredient, undefined, HttpStatus.BAD_REQUEST, {
          ingredient: name,
        });
      }
      seen.add(key);
      return {
        foodId: food?.id ?? null,
        ingredientName: name,
        categoryId: food?.categoryId ?? input.categoryId ?? null,
        quantity: input.quantity,
        unitId: input.unitId,
      };
    });
  }

  private async assertCategories(ids: readonly string[]): Promise<void> {
    for (const categoryId of new Set(ids)) {
      if (!(await this.categoriesService.exists(categoryId))) {
        throw AppException.validation(
          [{ field: 'ingredients.categoryId', constraints: { exists: 'Danh mục không tồn tại.' } }],
          'Danh mục không tồn tại.',
        );
      }
    }
  }

  private async assertEditableByContributor(
    viewer: Viewer,
    id: string,
    allowed: readonly ApprovalStatus[],
  ): Promise<void> {
    const recipe = await this.recipes.findOneBy({ id });
    if (!recipe || !(await this.recipes.isVisibleTo(id, viewer))) {
      throw AppException.notFound('Không tìm thấy công thức.');
    }
    if (recipe.createdBy !== viewer.userId || !allowed.includes(recipe.approvalStatus)) {
      throw new AppException(ErrorCode.RecipeNotEditable, undefined, HttpStatus.FORBIDDEN);
    }
  }

  private async getOrFail(id: string): Promise<Recipe> {
    const recipe = await this.recipes.findOneBy({ id });
    if (!recipe) {
      throw AppException.notFound('Không tìm thấy công thức.');
    }
    return recipe;
  }

  private async detail(id: string, userId: string): Promise<RecipeDetailResponse> {
    const recipe = await this.recipes.findWithIngredients(id);
    if (!recipe) {
      throw AppException.notFound('Không tìm thấy công thức.');
    }
    const [count, favorited] = await Promise.all([
      this.favorites.countForRecipe(id),
      this.favorites.favoritedIds(userId, [id]),
    ]);
    return RecipeDetailResponse.fromDetail(recipe, count, favorited.has(id));
  }

  private async toPage(
    userId: string,
    rows: RecipeListRow[],
    total: number,
    query: PaginationQueryDto,
  ): Promise<Paged<RecipeSummaryResponse>> {
    const favorited = await this.favorites.favoritedIds(
      userId,
      rows.map((row) => row.recipe.id),
    );
    const items = rows.map((row) =>
      RecipeSummaryResponse.from(row.recipe, row.favoriteCount, favorited.has(row.recipe.id)),
    );
    return new Paged(items, { total, page: query.page, pageSize: query.pageSize });
  }
}
