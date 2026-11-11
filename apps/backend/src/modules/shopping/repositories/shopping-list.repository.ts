import { type ShoppingListStatus } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { ShoppingList } from '../entities/shopping-list.entity';

export interface ShoppingListQueryOptions {
  familyId: string;
  status?: ShoppingListStatus;
  from?: string;
  to?: string;
  offset: number;
  limit: number;
}

/** Truy xuất danh sách mua sắm (Repository pattern, §10 — ShoppingListRepository). */
@Injectable()
export class ShoppingListRepository extends BaseRepository<ShoppingList> {
  constructor(dataSource: DataSource) {
    super(ShoppingList, dataSource);
  }

  /** Danh sách của gia đình (của gia đình khác → null, BR-06). */
  findInFamily(id: string, familyId: string): Promise<ShoppingList | null> {
    return this.findOneBy({ id, familyId });
  }

  /**
   * Khoá dòng danh sách (SELECT … FOR UPDATE) trong transaction: mọi thay đổi mặt hàng khoá
   * danh sách trước rồi mới tới mặt hàng (thứ tự cố định, không deadlock), nên "đánh dấu đã
   * mua" và "hoàn tất chuyến đi chợ" không chạy chồng lên nhau. @br BR-02, BR-06
   */
  lockInFamily(id: string, familyId: string): Promise<ShoppingList | null> {
    return this.createQueryBuilder('list')
      .setLock('pessimistic_write')
      .where('list.id = :id', { id })
      .andWhere('list.familyId = :familyId', { familyId })
      .getOne();
  }

  /** Lịch sử danh sách của gia đình, ngày đi chợ mới nhất trước. @fr FR-04, FR-21  @br BR-06 */
  listForFamily(options: ShoppingListQueryOptions): Promise<[ShoppingList[], number]> {
    const query = this.createQueryBuilder('list').where('list.familyId = :familyId', {
      familyId: options.familyId,
    });
    if (options.status) {
      query.andWhere('list.status = :status', { status: options.status });
    }
    if (options.from) {
      query.andWhere('list.targetDate >= :from', { from: options.from });
    }
    if (options.to) {
      query.andWhere('list.targetDate <= :to', { to: options.to });
    }
    return query
      .orderBy('list.targetDate', 'DESC')
      .addOrderBy('list.createdAt', 'DESC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }
}
