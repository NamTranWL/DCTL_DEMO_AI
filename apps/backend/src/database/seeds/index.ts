import {
  demoContributionsSeeder,
  demoFamilySeeder,
  demoFridgeSeeder,
  demoShoppingSeeder,
} from './demo.seeders';
import { categorySeeder, foodSeeder, recipeSeeder, unitSeeder } from './master-data.seeders';
import { type Seeder } from './seeder.interface';

/**
 * Ordered list of seeders run by `pnpm seed`. Order matters for foreign keys:
 * master data (categories → units → foods → recipes) → users/family → pending contributions
 * → fridge → shopping.
 */
export const SEEDERS: readonly Seeder[] = [
  categorySeeder,
  unitSeeder,
  foodSeeder,
  recipeSeeder,
  demoFamilySeeder,
  demoContributionsSeeder,
  demoFridgeSeeder,
  demoShoppingSeeder,
];
