import { ApprovalStatus } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { Brackets, DataSource, In, type SelectQueryBuilder } from 'typeorm';
import { escapeLike } from '../../../common/utils/db-error.util';
import { BaseRepository } from '../../../database/base.repository';
import { Food } from '../entities/food.entity';
import { type UsageCount } from '../master-data.types';

/** Accent/case-insensitive form of the name column; matches toSearchKey() in @dctl/shared. */
const SEARCH_EXPR = 'lower(unaccent(food.name))';

export interface FoodSearchOptions {
  /** Output of toSearchKey(): lower-case, no diacritics. */
  key: string;
  familyId: string | null;
  categoryId?: string;
  limit: number;
}

export interface FoodAdminListOptions {
  key?: string;
  status?: ApprovalStatus;
  categoryId?: string;
  offset: number;
  limit: number;
}

interface UsageRow {
  fridge_items: number;
  shopping_list_items: number;
  recipe_ingredients: number;
}

/** Truy xuất thực phẩm chuẩn (Repository pattern, §10 — FoodRepository). */
@Injectable()
export class FoodRepository extends BaseRepository<Food> {
  constructor(dataSource: DataSource) {
    super(Food, dataSource);
  }

  findByName(name: string): Promise<Food | null> {
    return this.findOneBy({ name });
  }

  /**
   * Gợi ý tên thực phẩm không dấu: chỉ APPROVED + PENDING do chính gia đình tạo (BR-04).
   * Thứ tự: khớp đầu tên → khớp đầu một từ → chứa chuỗi; rồi tên ngắn trước.
   */
  searchVisible(options: FoodSearchOptions): Promise<Food[]> {
    const key = escapeLike(options.key);
    const query = this.createQueryBuilder('food')
      .addSelect(
        `CASE WHEN ${SEARCH_EXPR} LIKE :prefix THEN 0 WHEN ${SEARCH_EXPR} LIKE :wordPrefix THEN 1 ELSE 2 END`,
        'match_rank',
      )
      .where(`${SEARCH_EXPR} LIKE :contains`)
      .setParameters({ prefix: `${key}%`, wordPrefix: `% ${key}%`, contains: `%${key}%` });
    this.whereVisibleTo(query, options.familyId);
    if (options.categoryId) {
      query.andWhere('food.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    return query
      .orderBy('match_rank', 'ASC')
      .addOrderBy('length(food.name)', 'ASC')
      .addOrderBy('food.name', 'ASC')
      .limit(options.limit)
      .getMany();
  }

  /** Các thực phẩm (theo id) mà gia đình được dùng (BR-04). */
  findVisibleByIds(ids: readonly string[], familyId: string | null): Promise<Food[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    const query = this.createQueryBuilder('food').where('food.id IN (:...ids)', {
      ids: [...new Set(ids)],
    });
    this.whereVisibleTo(query, familyId);
    return query.getMany();
  }

  /** Thực phẩm theo tên đã chuẩn hoá mà gia đình được dùng (tự gắn food_id cho nguyên liệu). */
  findVisibleByNames(names: readonly string[], familyId: string | null): Promise<Food[]> {
    if (names.length === 0) {
      return Promise.resolve([]);
    }
    const query = this.createQueryBuilder('food').where('food.name IN (:...names)', {
      names: [...new Set(names)],
    });
    this.whereVisibleTo(query, familyId);
    return query.getMany();
  }

  /** Danh sách cho Admin (mọi trạng thái), có lọc và phân trang. */
  findForAdmin(options: FoodAdminListOptions): Promise<[Food[], number]> {
    const query = this.createQueryBuilder('food').leftJoinAndSelect('food.category', 'category');
    if (options.key) {
      query.andWhere(`${SEARCH_EXPR} LIKE :contains`, { contains: `%${escapeLike(options.key)}%` });
    }
    if (options.status) {
      query.andWhere('food.approvalStatus = :status', { status: options.status });
    }
    if (options.categoryId) {
      query.andWhere('food.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    return query
      .orderBy('food.createdAt', 'DESC')
      .addOrderBy('food.name', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  countByStatus(statuses: readonly ApprovalStatus[]): Promise<number> {
    return this.countBy({ approvalStatus: In([...statuses]) });
  }

  /** Số nơi đang dùng thực phẩm (raw SQL: không import entity của module tầng trên). */
  async countUsages(foodId: string): Promise<UsageCount> {
    const rows: UsageRow[] = await this.manager.query(
      `SELECT
         (SELECT count(*) FROM fridge_items WHERE food_id = $1)::int        AS fridge_items,
         (SELECT count(*) FROM shopping_list_items WHERE food_id = $1)::int AS shopping_list_items,
         (SELECT count(*) FROM recipe_ingredients WHERE food_id = $1)::int  AS recipe_ingredients`,
      [foodId],
    );
    const row = rows[0];
    return {
      fridgeItems: row?.fridge_items ?? 0,
      shoppingListItems: row?.shopping_list_items ?? 0,
      recipeIngredients: row?.recipe_ingredients ?? 0,
    };
  }

  /** APPROVED, or PENDING created by this family (BR-04). */
  private whereVisibleTo(query: SelectQueryBuilder<Food>, familyId: string | null): void {
    query.andWhere(
      new Brackets((visible) => {
        visible.where('food.approvalStatus = :approved', { approved: ApprovalStatus.Approved });
        if (familyId !== null) {
          visible.orWhere(
            '(food.approvalStatus = :pending AND food.createdByFamilyId = :viewerFamilyId)',
            { pending: ApprovalStatus.Pending, viewerFamilyId: familyId },
          );
        }
      }),
    );
  }
}
