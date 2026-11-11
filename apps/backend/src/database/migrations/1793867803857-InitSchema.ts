import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1793867803857 implements MigrationInterface {
  name = 'InitSchema1793867803857';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "dietary_profiles" ("user_id" uuid NOT NULL, "allergies" jsonb NOT NULL DEFAULT '[]', "taste_preferences" text array NOT NULL DEFAULT '{}', "nutrition_goal" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_dietary_profiles" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'HOMEMAKER', 'MEMBER')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'LOCKED')`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "username" character varying(50) NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'MEMBER', "family_id" uuid, "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "uq_users_email" UNIQUE ("email"), CONSTRAINT "uq_users_username" UNIQUE ("username"), CONSTRAINT "pk_users" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_users_family_id" ON "users" ("family_id") `);
    await queryRunner.query(
      `CREATE TABLE "families" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "owner_id" uuid NOT NULL, CONSTRAINT "pk_families" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_families_owner_id" ON "families" ("owner_id") `);
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "storage_advice" text, "default_shelf_life_days" integer NOT NULL, CONSTRAINT "uq_categories_name" UNIQUE ("name"), CONSTRAINT "chk_categories_default_shelf_life_days" CHECK ("default_shelf_life_days" >= 0), CONSTRAINT "pk_categories" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."foods_approval_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "foods" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(150) NOT NULL, "category_id" uuid NOT NULL, "approval_status" "public"."foods_approval_status_enum" NOT NULL DEFAULT 'PENDING', "created_by_family_id" uuid, CONSTRAINT "uq_foods_name" UNIQUE ("name"), CONSTRAINT "pk_foods" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_foods_category_id" ON "foods" ("category_id") `);
    await queryRunner.query(
      `CREATE INDEX "idx_foods_approval_status" ON "foods" ("approval_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_foods_created_by_family_id" ON "foods" ("created_by_family_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "units" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "symbol" character varying(20) NOT NULL, "name" character varying(50) NOT NULL, "base_unit_id" uuid, "factor_to_base" numeric(18,6) NOT NULL DEFAULT '1', CONSTRAINT "uq_units_symbol" UNIQUE ("symbol"), CONSTRAINT "chk_units_factor_to_base" CHECK ("factor_to_base" > 0), CONSTRAINT "pk_units" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_units_base_unit_id" ON "units" ("base_unit_id") `);
    await queryRunner.query(
      `CREATE TABLE "shopping_list_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "shopping_list_id" uuid NOT NULL, "food_id" uuid, "item_name" character varying(150) NOT NULL, "category_id" uuid NOT NULL, "expected_quantity" numeric(12,3) NOT NULL, "unit_id" uuid NOT NULL, "is_purchased" boolean NOT NULL DEFAULT false, "assignee_id" uuid, "purchased_by" uuid, "purchased_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', CONSTRAINT "chk_shopping_list_items_expected_quantity" CHECK ("expected_quantity" > 0), CONSTRAINT "pk_shopping_list_items" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_shopping_list_items_shopping_list_id" ON "shopping_list_items" ("shopping_list_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_shopping_list_items_food_id" ON "shopping_list_items" ("food_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_shopping_list_items_assignee_id" ON "shopping_list_items" ("assignee_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shopping_lists_period_type_enum" AS ENUM('DAY', 'WEEK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shopping_lists_status_enum" AS ENUM('DRAFT', 'SHOPPING', 'COMPLETED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shopping_lists" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "family_id" uuid NOT NULL, "target_date" date NOT NULL, "period_type" "public"."shopping_lists_period_type_enum" NOT NULL DEFAULT 'DAY', "status" "public"."shopping_lists_status_enum" NOT NULL DEFAULT 'DRAFT', "created_by" uuid, CONSTRAINT "pk_shopping_lists" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_shopping_lists_family_id" ON "shopping_lists" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_shopping_lists_family_id_target_date" ON "shopping_lists" ("family_id", "target_date") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('EXPIRY_SOON', 'EXPIRED', 'SHOPPING_LIST_SHARED', 'SHOPPING_ITEM_ASSIGNED', 'SHOPPING_TRIP_COMPLETED', 'CONTENT_APPROVED', 'CONTENT_REJECTED', 'PURCHASE_REMINDER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "type" "public"."notifications_type_enum" NOT NULL, "content" text NOT NULL, "ref_id" uuid, "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_notifications" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_ref_id" ON "notifications" ("ref_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user_id_created_at" ON "notifications" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "recipe_ingredients" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "recipe_id" uuid NOT NULL, "food_id" uuid, "ingredient_name" character varying(150) NOT NULL, "category_id" uuid, "quantity" numeric(12,3) NOT NULL, "unit_id" uuid NOT NULL, CONSTRAINT "chk_recipe_ingredients_quantity" CHECK ("quantity" > 0), CONSTRAINT "pk_recipe_ingredients" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recipe_ingredients_recipe_id" ON "recipe_ingredients" ("recipe_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recipe_ingredients_food_id" ON "recipe_ingredients" ("food_id") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."recipes_source_enum" AS ENUM('SYSTEM', 'USER')`);
    await queryRunner.query(
      `CREATE TYPE "public"."recipes_approval_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "recipes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(200) NOT NULL, "instructions" text NOT NULL, "nutrition_info" jsonb, "source" "public"."recipes_source_enum" NOT NULL DEFAULT 'USER', "approval_status" "public"."recipes_approval_status_enum" NOT NULL DEFAULT 'PENDING', "created_by" uuid, CONSTRAINT "pk_recipes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_recipes_name" ON "recipes" ("name") `);
    await queryRunner.query(
      `CREATE INDEX "idx_recipes_approval_status" ON "recipes" ("approval_status") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_recipes_created_by" ON "recipes" ("created_by") `);
    await queryRunner.query(
      `CREATE TYPE "public"."meal_plan_entries_meal_type_enum" AS ENUM('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')`,
    );
    await queryRunner.query(
      `CREATE TABLE "meal_plan_entries" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "meal_plan_id" uuid NOT NULL, "date" date NOT NULL, "meal_type" "public"."meal_plan_entries_meal_type_enum" NOT NULL, "recipe_id" uuid NOT NULL, "servings" integer NOT NULL DEFAULT '1', CONSTRAINT "chk_meal_plan_entries_servings" CHECK ("servings" > 0), CONSTRAINT "pk_meal_plan_entries" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_meal_plan_entries_recipe_id" ON "meal_plan_entries" ("recipe_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_meal_plan_entries_meal_plan_id_date" ON "meal_plan_entries" ("meal_plan_id", "date") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."meal_plans_period_type_enum" AS ENUM('DAY', 'WEEK')`,
    );
    await queryRunner.query(
      `CREATE TABLE "meal_plans" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "family_id" uuid NOT NULL, "period_type" "public"."meal_plans_period_type_enum" NOT NULL DEFAULT 'DAY', "start_date" date NOT NULL, "end_date" date NOT NULL, CONSTRAINT "chk_meal_plans_dates" CHECK ("end_date" >= "start_date"), CONSTRAINT "pk_meal_plans" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_meal_plans_family_id" ON "meal_plans" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_meal_plans_family_id_start_date" ON "meal_plans" ("family_id", "start_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "favorite_recipes" ("user_id" uuid NOT NULL, "recipe_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_favorite_recipes" PRIMARY KEY ("user_id", "recipe_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_favorite_recipes_recipe_id" ON "favorite_recipes" ("recipe_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fridge_items_storage_location_enum" AS ENUM('FRIDGE', 'FREEZER', 'PANTRY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fridge_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "family_id" uuid NOT NULL, "food_id" uuid, "name" character varying(150) NOT NULL, "category_id" uuid NOT NULL, "quantity" numeric(12,3) NOT NULL, "unit_id" uuid NOT NULL, "expiry_date" date NOT NULL, "storage_location" "public"."fridge_items_storage_location_enum" NOT NULL, "purchased_price" numeric(12,2), CONSTRAINT "chk_fridge_items_quantity" CHECK ("quantity" >= 0), CONSTRAINT "pk_fridge_items" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_fridge_items_family_id" ON "fridge_items" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_fridge_items_food_id" ON "fridge_items" ("food_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_fridge_items_category_id" ON "fridge_items" ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_fridge_items_expiry_date" ON "fridge_items" ("expiry_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_fridge_items_family_id_expiry_date" ON "fridge_items" ("family_id", "expiry_date") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."inventory_transactions_type_enum" AS ENUM('ADD', 'CONSUME', 'DISCARD', 'ADJUST')`,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory_transactions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fridge_item_id" uuid NOT NULL, "type" "public"."inventory_transactions_type_enum" NOT NULL, "quantity" numeric(12,3) NOT NULL, "user_id" uuid, CONSTRAINT "chk_inventory_transactions_quantity" CHECK ("quantity" > 0), CONSTRAINT "pk_inventory_transactions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_inventory_transactions_fridge_item_id" ON "inventory_transactions" ("fridge_item_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_inventory_transactions_user_id" ON "inventory_transactions" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_inventory_transactions_type_created_at" ON "inventory_transactions" ("type", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ai_suggestion_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid, "request_json" jsonb NOT NULL, "response_json" jsonb, "validation_result" jsonb, "latency_ms" integer NOT NULL, "cache_hit" boolean NOT NULL DEFAULT false, "used_fallback" boolean NOT NULL DEFAULT false, CONSTRAINT "pk_ai_suggestion_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ai_suggestion_logs_user_id" ON "ai_suggestion_logs" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "dietary_profiles" ADD CONSTRAINT "fk_dietary_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "fk_users_family" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "families" ADD CONSTRAINT "fk_families_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "foods" ADD CONSTRAINT "fk_foods_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "foods" ADD CONSTRAINT "fk_foods_created_by_family" FOREIGN KEY ("created_by_family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD CONSTRAINT "fk_units_base_unit" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD CONSTRAINT "fk_shopping_list_items_shopping_list" FOREIGN KEY ("shopping_list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD CONSTRAINT "fk_shopping_list_items_food" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD CONSTRAINT "fk_shopping_list_items_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD CONSTRAINT "fk_shopping_list_items_unit" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD CONSTRAINT "fk_shopping_list_items_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD CONSTRAINT "fk_shopping_list_items_purchased_by" FOREIGN KEY ("purchased_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_lists" ADD CONSTRAINT "fk_shopping_lists_family" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_lists" ADD CONSTRAINT "fk_shopping_lists_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "fk_recipe_ingredients_recipe" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "fk_recipe_ingredients_food" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "fk_recipe_ingredients_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "fk_recipe_ingredients_unit" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipes" ADD CONSTRAINT "fk_recipes_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "fk_meal_plan_entries_meal_plan" FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "fk_meal_plan_entries_recipe" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meal_plans" ADD CONSTRAINT "fk_meal_plans_family" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_recipes" ADD CONSTRAINT "fk_favorite_recipes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_recipes" ADD CONSTRAINT "fk_favorite_recipes_recipe" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fridge_items" ADD CONSTRAINT "fk_fridge_items_family" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fridge_items" ADD CONSTRAINT "fk_fridge_items_food" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fridge_items" ADD CONSTRAINT "fk_fridge_items_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fridge_items" ADD CONSTRAINT "fk_fridge_items_unit" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_transactions" ADD CONSTRAINT "fk_inventory_transactions_fridge_item" FOREIGN KEY ("fridge_item_id") REFERENCES "fridge_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_transactions" ADD CONSTRAINT "fk_inventory_transactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_suggestion_logs" ADD CONSTRAINT "fk_ai_suggestion_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_suggestion_logs" DROP CONSTRAINT "fk_ai_suggestion_logs_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_transactions" DROP CONSTRAINT "fk_inventory_transactions_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_transactions" DROP CONSTRAINT "fk_inventory_transactions_fridge_item"`,
    );
    await queryRunner.query(`ALTER TABLE "fridge_items" DROP CONSTRAINT "fk_fridge_items_unit"`);
    await queryRunner.query(
      `ALTER TABLE "fridge_items" DROP CONSTRAINT "fk_fridge_items_category"`,
    );
    await queryRunner.query(`ALTER TABLE "fridge_items" DROP CONSTRAINT "fk_fridge_items_food"`);
    await queryRunner.query(`ALTER TABLE "fridge_items" DROP CONSTRAINT "fk_fridge_items_family"`);
    await queryRunner.query(
      `ALTER TABLE "favorite_recipes" DROP CONSTRAINT "fk_favorite_recipes_recipe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_recipes" DROP CONSTRAINT "fk_favorite_recipes_user"`,
    );
    await queryRunner.query(`ALTER TABLE "meal_plans" DROP CONSTRAINT "fk_meal_plans_family"`);
    await queryRunner.query(
      `ALTER TABLE "meal_plan_entries" DROP CONSTRAINT "fk_meal_plan_entries_recipe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meal_plan_entries" DROP CONSTRAINT "fk_meal_plan_entries_meal_plan"`,
    );
    await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "fk_recipes_created_by"`);
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "fk_recipe_ingredients_unit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "fk_recipe_ingredients_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "fk_recipe_ingredients_food"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "fk_recipe_ingredients_recipe"`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "fk_notifications_user"`);
    await queryRunner.query(
      `ALTER TABLE "shopping_lists" DROP CONSTRAINT "fk_shopping_lists_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_lists" DROP CONSTRAINT "fk_shopping_lists_family"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP CONSTRAINT "fk_shopping_list_items_purchased_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP CONSTRAINT "fk_shopping_list_items_assignee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP CONSTRAINT "fk_shopping_list_items_unit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP CONSTRAINT "fk_shopping_list_items_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP CONSTRAINT "fk_shopping_list_items_food"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP CONSTRAINT "fk_shopping_list_items_shopping_list"`,
    );
    await queryRunner.query(`ALTER TABLE "units" DROP CONSTRAINT "fk_units_base_unit"`);
    await queryRunner.query(`ALTER TABLE "foods" DROP CONSTRAINT "fk_foods_created_by_family"`);
    await queryRunner.query(`ALTER TABLE "foods" DROP CONSTRAINT "fk_foods_category"`);
    await queryRunner.query(`ALTER TABLE "families" DROP CONSTRAINT "fk_families_owner"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "fk_users_family"`);
    await queryRunner.query(
      `ALTER TABLE "dietary_profiles" DROP CONSTRAINT "fk_dietary_profiles_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_ai_suggestion_logs_user_id"`);
    await queryRunner.query(`DROP TABLE "ai_suggestion_logs"`);
    await queryRunner.query(`DROP INDEX "public"."idx_inventory_transactions_type_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_inventory_transactions_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_inventory_transactions_fridge_item_id"`);
    await queryRunner.query(`DROP TABLE "inventory_transactions"`);
    await queryRunner.query(`DROP TYPE "public"."inventory_transactions_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_fridge_items_family_id_expiry_date"`);
    await queryRunner.query(`DROP INDEX "public"."idx_fridge_items_expiry_date"`);
    await queryRunner.query(`DROP INDEX "public"."idx_fridge_items_category_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_fridge_items_food_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_fridge_items_family_id"`);
    await queryRunner.query(`DROP TABLE "fridge_items"`);
    await queryRunner.query(`DROP TYPE "public"."fridge_items_storage_location_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_favorite_recipes_recipe_id"`);
    await queryRunner.query(`DROP TABLE "favorite_recipes"`);
    await queryRunner.query(`DROP INDEX "public"."idx_meal_plans_family_id_start_date"`);
    await queryRunner.query(`DROP INDEX "public"."idx_meal_plans_family_id"`);
    await queryRunner.query(`DROP TABLE "meal_plans"`);
    await queryRunner.query(`DROP TYPE "public"."meal_plans_period_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_meal_plan_entries_meal_plan_id_date"`);
    await queryRunner.query(`DROP INDEX "public"."idx_meal_plan_entries_recipe_id"`);
    await queryRunner.query(`DROP TABLE "meal_plan_entries"`);
    await queryRunner.query(`DROP TYPE "public"."meal_plan_entries_meal_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_recipes_created_by"`);
    await queryRunner.query(`DROP INDEX "public"."idx_recipes_approval_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_recipes_name"`);
    await queryRunner.query(`DROP TABLE "recipes"`);
    await queryRunner.query(`DROP TYPE "public"."recipes_approval_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."recipes_source_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_recipe_ingredients_food_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_recipe_ingredients_recipe_id"`);
    await queryRunner.query(`DROP TABLE "recipe_ingredients"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notifications_user_id_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notifications_ref_id"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_shopping_lists_family_id_target_date"`);
    await queryRunner.query(`DROP INDEX "public"."idx_shopping_lists_family_id"`);
    await queryRunner.query(`DROP TABLE "shopping_lists"`);
    await queryRunner.query(`DROP TYPE "public"."shopping_lists_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."shopping_lists_period_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_shopping_list_items_assignee_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_shopping_list_items_food_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_shopping_list_items_shopping_list_id"`);
    await queryRunner.query(`DROP TABLE "shopping_list_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_units_base_unit_id"`);
    await queryRunner.query(`DROP TABLE "units"`);
    await queryRunner.query(`DROP INDEX "public"."idx_foods_created_by_family_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_foods_approval_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_foods_category_id"`);
    await queryRunner.query(`DROP TABLE "foods"`);
    await queryRunner.query(`DROP TYPE "public"."foods_approval_status_enum"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP INDEX "public"."idx_families_owner_id"`);
    await queryRunner.query(`DROP TABLE "families"`);
    await queryRunner.query(`DROP INDEX "public"."idx_users_family_id"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "dietary_profiles"`);
  }
}
