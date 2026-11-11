import { type InventoryTransactionType } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { InventoryTransaction } from '../entities/inventory-transaction.entity';

/** One row to append to the inventory log. */
export interface TransactionDraft {
  fridgeItemId: string;
  type: InventoryTransactionType;
  quantity: number;
  userId: string | null;
}

/**
 * Nhật ký tồn kho (chỉ thêm, không sửa/xoá) — nguồn cho báo cáo tiêu thụ/lãng phí.
 * @uc UC-FRIDGE-01, UC-FRIDGE-03, UC-RPT-01  @fr FR-13, FR-22, FR-23  @br BR-03, BR-05
 */
@Injectable()
export class InventoryTransactionRepository extends BaseRepository<InventoryTransaction> {
  constructor(dataSource: DataSource) {
    super(InventoryTransaction, dataSource);
  }

  /** Ghi các giao dịch (trong transaction của thao tác kho). */
  async record(drafts: readonly TransactionDraft[]): Promise<InventoryTransaction[]> {
    if (drafts.length === 0) {
      return [];
    }
    return this.save(drafts.map((draft) => this.create({ ...draft })));
  }

  /** Lịch sử của một lô, mới nhất trước. */
  findByFridgeItem(fridgeItemId: string): Promise<InventoryTransaction[]> {
    return this.find({
      where: { fridgeItemId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }
}
