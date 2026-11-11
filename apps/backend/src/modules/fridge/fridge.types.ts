import { type FridgeItemSource, type StorageLocation } from '@dctl/shared';
import { type EntityManager } from 'typeorm';
import { type IsoDate } from '../../common/utils/date.util';
import { type FridgeItem } from './entities/fridge-item.entity';
import { type FridgeItemsAddedEvent } from './events';

/**
 * One lot to put into the fridge, with master-data references already validated (BR-04):
 * by CatalogItemResolver for manual entries, or copied from a purchased shopping item.
 */
export interface FridgeItemInput {
  foodId: string | null;
  name: string;
  categoryId: string;
  quantity: number;
  unitId: string;
  /** null/undefined → today + category.default_shelf_life_days (BR-02). */
  expiryDate?: IsoDate | null;
  /** Default: FRIDGE (ngăn mát). */
  storageLocation?: StorageLocation;
  purchasedPrice?: number | null;
}

/** Who adds stock and in which transaction. */
export interface AddItemsContext {
  familyId: string;
  actorId: string;
  source: FridgeItemSource;
  /**
   * Join the caller's transaction (ShoppingService.completeTrip). The caller then publishes
   * the returned event after commit with FridgeService.publishItemsAdded().
   */
  manager?: EntityManager;
}

/** Result of addItems: the lot that received each input (same order as the inputs). */
export interface FridgeAddResult {
  lots: FridgeItem[];
  /** Domain event to publish once the transaction has committed. */
  event: FridgeItemsAddedEvent;
}

/** One consume line after DTO validation: an explicit lot or a food (FEFO). */
export type ConsumeLine =
  | { fridgeItemId: string; foodId?: undefined; quantity: number; unitId?: string }
  | { fridgeItemId?: undefined; foodId: string; quantity: number; unitId: string };
