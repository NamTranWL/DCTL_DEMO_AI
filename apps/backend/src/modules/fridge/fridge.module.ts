import { Module } from '@nestjs/common';
import { MasterDataModule } from '../master-data/master-data.module';
import { FridgeController } from './fridge.controller';
import { FridgeService } from './fridge.service';
import { FridgeRealtimeListener } from './listeners/fridge-realtime.listener';
import { FridgeItemRepository } from './repositories/fridge-item.repository';
import { InventoryTransactionRepository } from './repositories/inventory-transaction.repository';
import {
  FefoDeductionStrategy,
  STOCK_DEDUCTION_STRATEGY,
} from './strategies/stock-deduction.strategy';

/**
 * Module fridge (UC-FRIDGE-01..03; FR-08, FR-09, FR-11..13; BR-01..06): kho thực phẩm, nhật
 * ký tồn kho, trừ kho FEFO. Exports FridgeService for shopping (completeTrip → addItems, BR-02)
 * and later meal-plan/ai (B9: stock lookups). Depends only on master-data (no cycle).
 */
@Module({
  imports: [MasterDataModule],
  controllers: [FridgeController],
  providers: [
    FridgeService,
    FridgeItemRepository,
    InventoryTransactionRepository,
    FridgeRealtimeListener,
    { provide: STOCK_DEDUCTION_STRATEGY, useClass: FefoDeductionStrategy },
  ],
  exports: [FridgeService],
})
export class FridgeModule {}
