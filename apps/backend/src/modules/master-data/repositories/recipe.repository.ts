import { ApprovalStatus } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { Brackets, DataSource, type SelectQueryBuilder } from 'typeorm';
import { escapeLike } from '../../../common/utils/db-error.util';
import { BaseRepository } from '../../../database/base.repository';
import { Recipe } from '../entities/recipe.entity';
import { type Viewer } from '../master-data.types';

export type RecipeSort = 'name' | 'popular' | 'newest';

export interface RecipeListOptions {
  key?: string;
  sort: RecipeSort;
  offset: number;
  limit: number;
  /** Admin only: filter by status; user lists ignore it. */
  status?: ApprovalStatus;
}

/** A recipe row of a list with its favorite count. */
export interface RecipeListRow {
  recipe: Recipe;
  favoriteCount: number;
}

const FAVORITE_COUNT_SQL =
  '(SELECT count(*) FROM favorite_recipes fav WHERE fav.recipe_id = recipe.id)';

/** Truy xuất công thức (Repository pattern, §10). */
@Injectable()
export class RecipeRepository extends BaseRepository<Recipe> {
  constructor(dataSource: DataSource) {
    super(Recipe, dataSource);
  }

  /** Công thức kèm nguyên liệu và đơn vị (chi tiết). */
  findWithIngredients(id: string): Promise<Recipe | null> {
    return this.createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.ingredients', 'ingredient')
      .leftJoinAndSelect('ingredient.unit', 'unit')
      .where('recipe.id = :id', { id })
      .orderBy('ingredient.createdAt', 'ASC')
      .addOrderBy('ingredient.ingredientName', 'ASC')
      .getOne();
  }

  /** Người xem có được thấy công thức không (BR-08). */
  async isVisibleTo(id: string, viewer: Viewer): Promise<boolean> {
    const query = this.createQueryBuilder('recipe').where('recipe.id = :id', { id });
    this.whereVisibleTo(query, viewer);
    return (await query.getCount()) > 0;
  }

  /** Các công thức (theo id) người xem được thấy. @br BR-08 */
  findVisibleByIds(ids: readonly string[], viewer: Viewer): Promise<Recipe[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    const query = this.createQueryBuilder('recipe').where('recipe.id IN (:...ids)', {
      ids: [...new Set(ids)],
    });
    this.whereVisibleTo(query, viewer);
    return query.getMany();
  }

  /** Danh sách công thức người xem được thấy, có đếm lượt yêu thích. */
  listVisible(viewer: Viewer, options: RecipeListOptions): Promise<[RecipeListRow[], number]> {
    const query = this.createQueryBuilder('recipe');
    this.whereVisibleTo(query, viewer);
    return this.page(query, options);
  }

  /** Danh sách cho Admin (mọi trạng thái). */
  listForAdmin(options: RecipeListOptions): Promise<[RecipeListRow[], number]> {
    const query = this.createQueryBuilder('recipe');
    if (options.status) {
      query.andWhere('recipe.approvalStatus = :status', { status: options.status });
    }
    return this.page(query, options);
  }

  /** Số dòng thực đơn đang dùng công thức (raw SQL, không import module meal-plan). */
  async countMealPlanUsages(recipeId: string): Promise<number> {
    const rows: { count: number }[] = await this.manager.query(
      'SELECT count(*)::int AS count FROM meal_plan_entries WHERE recipe_id = $1',
      [recipeId],
    );
    return rows[0]?.count ?? 0;
  }

  private async page(
    query: SelectQueryBuilder<Recipe>,
    options: RecipeListOptions,
  ): Promise<[RecipeListRow[], number]> {
    if (options.key) {
      query.andWhere('lower(unaccent(recipe.name)) LIKE :contains', {
        contains: `%${escapeLike(options.key)}%`,
      });
    }
    const total = await query.clone().getCount();

    query.addSelect(FAVORITE_COUNT_SQL, 'favorite_count');
    if (options.sort === 'popular') {
      query.orderBy('favorite_count', 'DESC').addOrderBy('recipe.name', 'ASC');
    } else if (options.sort === 'newest') {
      query.orderBy('recipe.createdAt', 'DESC');
    } else {
      query.orderBy('recipe.name', 'ASC');
    }
    const { entities, raw } = await query
      .offset(options.offset)
      .limit(options.limit)
      .getRawAndEntities<{ favorite_count: string | number }>();

    const rows = entities.map((recipe, index) => ({
      recipe,
      favoriteCount: Number(raw[index]?.favorite_count ?? 0),
    }));
    return [rows, total];
  }

  /**
   * APPROVED is public; PENDING/REJECTED only for the contributor and members of the
   * contributor's current family (decision B5).
   */
  private whereVisibleTo(query: SelectQueryBuilder<Recipe>, viewer: Viewer): void {
    query.leftJoin('recipe.creator', 'creator').andWhere(
      new Brackets((visible) => {
        visible
          .where('recipe.approvalStatus = :approved', { approved: ApprovalStatus.Approved })
          .orWhere('recipe.createdBy = :viewerId', { viewerId: viewer.userId });
        if (viewer.familyId !== null) {
          visible.orWhere('creator.familyId = :viewerFamilyId', {
            viewerFamilyId: viewer.familyId,
          });
        }
      }),
    );
  }
}
