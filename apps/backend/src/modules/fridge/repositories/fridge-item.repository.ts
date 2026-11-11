import { type StorageLocation } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { escapeLike } from '../../../common/utils/db-error.util';
import { BaseRepository } from '../../../database/base.repository';
import { FridgeItem } from '../entities/fridge-item.entity';

/** Accent/case-insensitive form of the lot name; matches toSearchKey() in @dctl/shared. */
const SEARCH_EXPR = 'lower(unaccent(item.name))';

/** Date window of an expiry state, computed from "today" (BR-01). */
export interface ExpiryWindow {
  /** expiry_date > after */
  after?: string;
  /** expiry_date <= until */
  until?: string;
}

export interface FridgeSearchOptions {
  familyId: string;
  /** Output of toSearchKey(). */
  key?: string;
  categoryId?: string;
  foodId?: string;
  storageLocation?: StorageLocation;
  window?: ExpiryWindow;
  offset: number;
  limit: number;
}

/** Key of a lot that can absorb new stock (same food/name, unit, expiry and place). */
export interface LotKey {
  familyId: string;
  foodId: string | null;
  name: string;
  unitId: string;
  expiryDate: string;
  storageLocation: StorageLocation;
}

/** Truy xuất lô thực phẩm trong kho (Repository pattern, §10 — FridgeItemRepository). */
@Injectable()
export class FridgeItemRepository extends BaseRepository<FridgeItem> {
  constructor(dataSource: DataSource) {
    super(FridgeItem, dataSource);
  }

  /** Một lô của gia đình (lô của gia đình khác → null, BR-06). */
  findInFamily(id: string, familyId: string): Promise<FridgeItem | null> {
    return this.findOne({
      where: { id, familyId },
      relations: { category: true, unit: true },
    });
  }

  /**
   * Tìm theo tên (không dấu) / danh mục / thực phẩm / vị trí / trạng thái hạn; chỉ lô còn hàng.
   * Sắp xếp hạn sớm trước (FEFO) để màn hình kho nhắc dùng trước. @br BR-01, BR-06
   */
  search(options: FridgeSearchOptions): Promise<[FridgeItem[], number]> {
    const query = this.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.unit', 'unit')
      .where('item.familyId = :familyId', { familyId: options.familyId })
      .andWhere('item.quantity > 0');
    if (options.key) {
      query.andWhere(`${SEARCH_EXPR} LIKE :contains`, {
        contains: `%${escapeLike(options.key)}%`,
      });
    }
    if (options.categoryId) {
      query.andWhere('item.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    if (options.foodId) {
      query.andWhere('item.foodId = :foodId', { foodId: options.foodId });
    }
    if (options.storageLocation) {
      query.andWhere('item.storageLocation = :storageLocation', {
        storageLocation: options.storageLocation,
      });
    }
    if (options.window) {
      const { after, until } = options.window;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('TRUE');
          if (after !== undefined) {
            qb.andWhere('item.expiryDate > :after', { after });
          }
          if (until !== undefined) {
            qb.andWhere('item.expiryDate <= :until', { until });
          }
        }),
      );
    }
    return query
      .orderBy('item.expiryDate', 'ASC')
      .addOrderBy('item.createdAt', 'ASC')
      .addOrderBy('item.id', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  /**
   * Khoá (SELECT … FOR UPDATE) các lô cần trừ: lô chọn đích danh + mọi lô còn hàng của các
   * thực phẩm trừ theo FEFO. Khoá theo thứ tự id để hai yêu cầu song song không deadlock.
   * Dùng trong transaction (withManager). @br BR-03, BR-06
   */
  lockForDeduction(
    familyId: string,
    lotIds: readonly string[],
    foodIds: readonly string[],
  ): Promise<FridgeItem[]> {
    if (lotIds.length === 0 && foodIds.length === 0) {
      return Promise.resolve([]);
    }
    const query = this.createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.familyId = :familyId', { familyId })
      .andWhere(
        new Brackets((qb) => {
          qb.where('FALSE');
          if (lotIds.length > 0) {
            qb.orWhere('item.id IN (:...lotIds)', { lotIds: [...new Set(lotIds)] });
          }
          if (foodIds.length > 0) {
            qb.orWhere('(item.foodId IN (:...foodIds) AND item.quantity > 0)', {
              foodIds: [...new Set(foodIds)],
            });
          }
        }),
      );
    return query.orderBy('item.id', 'ASC').getMany();
  }

  /** Khoá các lô theo id (huỷ, sửa). @br BR-06 */
  lockByIds(familyId: string, ids: readonly string[]): Promise<FridgeItem[]> {
    return this.lockForDeduction(familyId, ids, []);
  }

  /**
   * Lô còn hàng có thể nhận thêm hàng mới (cùng thực phẩm — hoặc cùng tên nếu food_id NULL —
   * cùng đơn vị, hạn dùng, vị trí): gộp thay vì tạo lô trùng. Có khoá dòng.
   * @uc UC-FRIDGE-01  @fr FR-08, FR-09
   */
  findMergeTarget(key: LotKey): Promise<FridgeItem | null> {
    const query = this.createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.familyId = :familyId', { familyId: key.familyId })
      .andWhere('item.unitId = :unitId', { unitId: key.unitId })
      .andWhere('item.expiryDate = :expiryDate', { expiryDate: key.expiryDate })
      .andWhere('item.storageLocation = :storageLocation', {
        storageLocation: key.storageLocation,
      })
      .andWhere('item.quantity > 0');
    if (key.foodId === null) {
      query.andWhere('item.foodId IS NULL').andWhere('item.name = :name', { name: key.name });
    } else {
      query.andWhere('item.foodId = :foodId', { foodId: key.foodId });
    }
    return query.orderBy('item.createdAt', 'ASC').limit(1).getOne();
  }
}
