import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { FavoriteRecipe } from '../entities/favorite-recipe.entity';

/** Truy xuất công thức yêu thích (Repository pattern, §10). */
@Injectable()
export class FavoriteRecipeRepository extends BaseRepository<FavoriteRecipe> {
  constructor(dataSource: DataSource) {
    super(FavoriteRecipe, dataSource);
  }

  /** Thêm yêu thích; đã có thì bỏ qua (idempotent). */
  async addFavorite(userId: string, recipeId: string): Promise<void> {
    await this.createQueryBuilder()
      .insert()
      .into(FavoriteRecipe)
      .values({ userId, recipeId })
      .orIgnore()
      .execute();
  }

  async removeFavorite(userId: string, recipeId: string): Promise<void> {
    await this.delete({ userId, recipeId });
  }

  /** Các recipeId (trong danh sách cho trước) mà người dùng đã yêu thích. */
  async favoritedIds(userId: string, recipeIds: readonly string[]): Promise<Set<string>> {
    if (recipeIds.length === 0) {
      return new Set();
    }
    const rows = await this.find({
      where: { userId, recipeId: In([...recipeIds]) },
      select: { recipeId: true },
    });
    return new Set(rows.map((row) => row.recipeId));
  }

  /** Số lượt yêu thích của nhiều công thức (một truy vấn). */
  async countsFor(recipeIds: readonly string[]): Promise<Map<string, number>> {
    if (recipeIds.length === 0) {
      return new Map();
    }
    const rows = await this.createQueryBuilder('fav')
      .select('fav.recipeId', 'recipeId')
      .addSelect('count(*)::int', 'count')
      .where('fav.recipeId IN (:...ids)', { ids: [...new Set(recipeIds)] })
      .groupBy('fav.recipeId')
      .getRawMany<{ recipeId: string; count: number }>();
    return new Map(rows.map((row) => [row.recipeId, Number(row.count)]));
  }

  countForRecipe(recipeId: string): Promise<number> {
    return this.countBy({ recipeId });
  }

  /** Id công thức yêu thích của người dùng, mới nhất trước. */
  async recipeIdsOf(userId: string): Promise<string[]> {
    const rows = await this.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: { recipeId: true },
    });
    return rows.map((row) => row.recipeId);
  }
}
