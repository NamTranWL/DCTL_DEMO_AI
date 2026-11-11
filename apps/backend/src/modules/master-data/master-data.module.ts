import { Module } from '@nestjs/common';
import { CatalogItemResolver } from './catalog-item.resolver';
import { CategoriesService } from './categories.service';
import { CatalogController } from './controllers/catalog.controller';
import { MasterDataAdminController } from './controllers/master-data-admin.controller';
import { ModerationAdminController } from './controllers/moderation-admin.controller';
import { RecipesController } from './controllers/recipes.controller';
import { FoodsService } from './foods.service';
import { RecipesService } from './recipes.service';
import { CategoryRepository } from './repositories/category.repository';
import { FavoriteRecipeRepository } from './repositories/favorite-recipe.repository';
import { FoodRepository } from './repositories/food.repository';
import { RecipeRepository } from './repositories/recipe.repository';
import { UnitRepository } from './repositories/unit.repository';
import { UnitsService } from './units.service';

/**
 * Module master-data (UC-ADM-02/03, UC-RCP-01; FR-05, FR-09, FR-11, FR-17, FR-25, FR-26;
 * BR-04, BR-08): danh mục, đơn vị, thực phẩm chuẩn, công thức, kiểm duyệt, yêu thích.
 * Exports the services used by fridge/shopping (B7: CatalogItemResolver for BR-04 validation,
 * CategoriesService for the default shelf life, UnitsService for FEFO across units),
 * meal-plan and ai (B9: recipes, UnitConverter, normalizeFoodName from @dctl/shared).
 */
@Module({
  controllers: [
    CatalogController,
    RecipesController,
    MasterDataAdminController,
    ModerationAdminController,
  ],
  providers: [
    CategoriesService,
    UnitsService,
    FoodsService,
    RecipesService,
    CategoryRepository,
    UnitRepository,
    FoodRepository,
    RecipeRepository,
    FavoriteRecipeRepository,
    CatalogItemResolver,
  ],
  exports: [CategoriesService, UnitsService, FoodsService, RecipesService, CatalogItemResolver],
})
export class MasterDataModule {}
