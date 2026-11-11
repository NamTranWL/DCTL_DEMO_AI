import { Module } from '@nestjs/common';
import { FridgeModule } from '../fridge/fridge.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { UsersModule } from '../users/users.module';
import { ShoppingListItemRepository } from './repositories/shopping-list-item.repository';
import { ShoppingListRepository } from './repositories/shopping-list.repository';
import { ShoppingController } from './shopping.controller';
import { ShoppingGateway } from './shopping.gateway';
import { ShoppingService } from './shopping.service';

/**
 * Module shopping (UC-SHOP-01..03; FR-03..FR-08; BR-02, BR-04, BR-06): danh sách mua sắm,
 * phân công, đánh dấu đã mua, hoàn tất chuyến đi chợ → FridgeService.addItems(), realtime
 * qua ShoppingGateway. Dependencies point down only: shopping → fridge → master-data; users.
 * Exports ShoppingService for meal-plan/ai (B9, FR-16: add missing ingredients).
 */
@Module({
  imports: [MasterDataModule, FridgeModule, UsersModule],
  controllers: [ShoppingController],
  providers: [ShoppingService, ShoppingListRepository, ShoppingListItemRepository, ShoppingGateway],
  exports: [ShoppingService],
})
export class ShoppingModule {}
