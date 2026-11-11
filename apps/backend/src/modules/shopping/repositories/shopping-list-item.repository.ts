import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { ShoppingListItem } from '../entities/shopping-list-item.entity';
import { type ItemCounts } from '../shopping.types';

interface CountRow {
  list_id: string;
  total: number;
  purchased: number;
}

/** Truy xuất mặt hàng của danh sách mua sắm (Repository pattern, §10). */
@Injectable()
export class ShoppingListItemRepository extends BaseRepository<ShoppingListItem> {
  constructor(dataSource: DataSource) {
    super(ShoppingListItem, dataSource);
  }

  /** Mặt hàng của một danh sách, gom theo danh mục (FR-05) rồi theo thứ tự thêm. */
  findByList(listId: string): Promise<ShoppingListItem[]> {
    return this.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.unit', 'unit')
      .leftJoinAndSelect('item.assignee', 'assignee')
      .where('item.shoppingListId = :listId', { listId })
      .orderBy('category.name', 'ASC')
      .addOrderBy('item.createdAt', 'ASC')
      .addOrderBy('item.id', 'ASC')
      .getMany();
  }

  /** Một mặt hàng kèm danh mục, đơn vị, người được phân công (để trả về / phát realtime). */
  findWithRelations(id: string): Promise<ShoppingListItem | null> {
    return this.findOne({
      where: { id },
      relations: { category: true, unit: true, assignee: true },
    });
  }

  /** Khoá một mặt hàng của danh sách (sau khi đã khoá danh sách). */
  lockInList(id: string, listId: string): Promise<ShoppingListItem | null> {
    return this.createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.id = :id', { id })
      .andWhere('item.shoppingListId = :listId', { listId })
      .getOne();
  }

  /** Mặt hàng đã mua của danh sách (BR-02: chỉ những mục này được nhập kho). */
  findPurchased(listId: string): Promise<ShoppingListItem[]> {
    return this.find({
      where: { shoppingListId: listId, isPurchased: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  /** Tổng số / số đã mua của nhiều danh sách. */
  async countByLists(listIds: readonly string[]): Promise<Map<string, ItemCounts>> {
    const counts = new Map<string, ItemCounts>();
    if (listIds.length === 0) {
      return counts;
    }
    const rows = await this.createQueryBuilder('item')
      .select('item.shoppingListId', 'list_id')
      .addSelect('count(*)::int', 'total')
      .addSelect('count(*) FILTER (WHERE item.isPurchased)::int', 'purchased')
      .where('item.shoppingListId IN (:...ids)', { ids: [...new Set(listIds)] })
      .groupBy('item.shoppingListId')
      .getRawMany<CountRow>();
    for (const row of rows) {
      counts.set(row.list_id, { total: row.total, purchased: row.purchased });
    }
    return counts;
  }
}
