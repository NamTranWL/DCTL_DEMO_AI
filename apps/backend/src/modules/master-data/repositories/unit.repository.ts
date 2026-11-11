import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { Unit } from '../entities/unit.entity';
import { type UsageCount } from '../master-data.types';

interface UsageRow {
  fridge_items: number;
  shopping_list_items: number;
  recipe_ingredients: number;
}

/** Truy xuất đơn vị tính (Repository pattern, §10). */
@Injectable()
export class UnitRepository extends BaseRepository<Unit> {
  constructor(dataSource: DataSource) {
    super(Unit, dataSource);
  }

  /** Đơn vị gốc trước, rồi tới đơn vị dẫn xuất; trong nhóm theo hệ số tăng dần. */
  findAllOrdered(): Promise<Unit[]> {
    return this.createQueryBuilder('unit')
      .orderBy('COALESCE(unit.baseUnitId, unit.id)', 'ASC')
      .addOrderBy('unit.factorToBase', 'ASC')
      .getMany();
  }

  findManyByIds(ids: readonly string[]): Promise<Unit[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.findBy({ id: In([...new Set(ids)]) });
  }

  countDerived(unitId: string): Promise<number> {
    return this.countBy({ baseUnitId: unitId });
  }

  /**
   * Số dòng đang dùng đơn vị này. Raw SQL on purpose: fridge/shopping are higher-level modules
   * and master-data must not import their entities (no circular module dependency).
   */
  async countUsages(unitId: string): Promise<UsageCount> {
    const rows: UsageRow[] = await this.manager.query(
      `SELECT
         (SELECT count(*) FROM fridge_items WHERE unit_id = $1)::int        AS fridge_items,
         (SELECT count(*) FROM shopping_list_items WHERE unit_id = $1)::int AS shopping_list_items,
         (SELECT count(*) FROM recipe_ingredients WHERE unit_id = $1)::int  AS recipe_ingredients`,
      [unitId],
    );
    const row = rows[0];
    return {
      fridgeItems: row?.fridge_items ?? 0,
      shoppingListItems: row?.shopping_list_items ?? 0,
      recipeIngredients: row?.recipe_ingredients ?? 0,
    };
  }
}
