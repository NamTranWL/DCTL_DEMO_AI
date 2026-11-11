# Cơ sở dữ liệu — tài liệu để vẽ ERD / class / state diagram

Nguồn: PROJECT_CONTEXT.md §10–11. Migration: `*-InitSchema.ts` (B3), `*-AuthRefreshTokensInviteCode.ts` (B4), `*-EnableUnaccentSearch.ts` (B5), `*-PushTokens.ts` (B6).
Tên bảng/cột trong DB là snake_case; thuộc tính entity là camelCase (`SnakeNamingStrategy`).

## 1. Bảng ↔ entity ↔ module (17 bảng theo §11 + 2 bảng bổ sung)

| Bảng                     | Entity                 | Module          | File                                                       |
| ------------------------ | ---------------------- | --------------- | ---------------------------------------------------------- |
| `users`                  | `User`                 | `users`         | `modules/users/entities/user.entity.ts`                    |
| `dietary_profiles`       | `DietaryProfile`       | `users`         | `modules/users/entities/dietary-profile.entity.ts`         |
| `families`               | `Family`               | `families`      | `modules/families/entities/family.entity.ts`               |
| `categories`             | `Category`             | `master-data`   | `modules/master-data/entities/category.entity.ts`          |
| `units`                  | `Unit`                 | `master-data`   | `modules/master-data/entities/unit.entity.ts`              |
| `foods`                  | `Food`                 | `master-data`   | `modules/master-data/entities/food.entity.ts`              |
| `recipes`                | `Recipe`               | `master-data`   | `modules/master-data/entities/recipe.entity.ts`            |
| `recipe_ingredients`     | `RecipeIngredient`     | `master-data`   | `modules/master-data/entities/recipe-ingredient.entity.ts` |
| `favorite_recipes`       | `FavoriteRecipe`       | `master-data`   | `modules/master-data/entities/favorite-recipe.entity.ts`   |
| `fridge_items`           | `FridgeItem`           | `fridge`        | `modules/fridge/entities/fridge-item.entity.ts`            |
| `inventory_transactions` | `InventoryTransaction` | `fridge`        | `modules/fridge/entities/inventory-transaction.entity.ts`  |
| `shopping_lists`         | `ShoppingList`         | `shopping`      | `modules/shopping/entities/shopping-list.entity.ts`        |
| `shopping_list_items`    | `ShoppingListItem`     | `shopping`      | `modules/shopping/entities/shopping-list-item.entity.ts`   |
| `meal_plans`             | `MealPlan`             | `meal-plan`     | `modules/meal-plan/entities/meal-plan.entity.ts`           |
| `meal_plan_entries`      | `MealPlanEntry`        | `meal-plan`     | `modules/meal-plan/entities/meal-plan-entry.entity.ts`     |
| `notifications`          | `Notification`         | `notifications` | `modules/notifications/entities/notification.entity.ts`    |
| `ai_suggestion_logs`     | `AiSuggestionLog`      | `ai`            | `modules/ai/entities/ai-suggestion-log.entity.ts`          |
| `refresh_tokens` (B4)    | `RefreshToken`         | `auth`          | `modules/auth/entities/refresh-token.entity.ts`            |
| `push_tokens` (B6)       | `PushToken`            | `notifications` | `modules/notifications/entities/push-token.entity.ts`      |

Mọi bảng có `id uuid` (gen_random_uuid), `created_at`, `updated_at` qua `BaseEntity` — trừ
`dietary_profiles` (PK `user_id`) và `favorite_recipes` (PK ghép `user_id, recipe_id`).

## 2. Quan hệ và khoá ngoại

| Bảng con → bảng cha                                    | Bội số | onDelete | Ghi chú                    |
| ------------------------------------------------------ | ------ | -------- | -------------------------- |
| users.family_id → families                             | N–0..1 | SET NULL | BR-11: tối đa 1 gia đình   |
| families.owner_id → users                              | N–1    | RESTRICT | chủ gia đình (nội trợ)     |
| dietary_profiles.user_id → users                       | 1–1    | CASCADE  |                            |
| units.base_unit_id → units                             | N–0..1 | RESTRICT | nhóm quy đổi (BR-04)       |
| foods.category_id → categories                         | N–1    | RESTRICT |                            |
| foods.created_by_family_id → families                  | N–0..1 | SET NULL | tên do gia đình đề xuất    |
| recipes.created_by → users                             | N–0..1 | SET NULL | NULL = công thức chuẩn     |
| recipe_ingredients.recipe_id → recipes                 | N–1    | CASCADE  | thành phần (composition)   |
| recipe_ingredients.food_id → foods                     | N–0..1 | SET NULL | BR-10                      |
| recipe_ingredients.category_id → categories            | N–0..1 | SET NULL |                            |
| recipe_ingredients.unit_id → units                     | N–1    | RESTRICT |                            |
| favorite_recipes.(user_id, recipe_id)                  | N–N    | CASCADE  | bảng nối users ↔ recipes   |
| fridge_items.family_id → families                      | N–1    | CASCADE  | BR-06                      |
| fridge_items.food_id → foods                           | N–0..1 | SET NULL |                            |
| fridge_items.category_id / unit_id                     | N–1    | RESTRICT |                            |
| inventory_transactions.fridge_item_id                  | N–1    | CASCADE  | nhật ký tồn kho            |
| inventory_transactions.user_id → users                 | N–0..1 | SET NULL | NULL = hệ thống            |
| shopping_lists.family_id → families                    | N–1    | CASCADE  | BR-06                      |
| shopping_lists.created_by → users                      | N–0..1 | SET NULL |                            |
| shopping_list_items.shopping_list_id                   | N–1    | CASCADE  | thành phần (composition)   |
| shopping_list_items.food_id → foods                    | N–0..1 | SET NULL |                            |
| shopping_list_items.category_id / unit_id              | N–1    | RESTRICT |                            |
| shopping_list_items.assignee_id / purchased_by → users | N–0..1 | SET NULL | FR-03 phân công            |
| meal_plans.family_id → families                        | N–1    | CASCADE  | BR-06                      |
| meal_plan_entries.meal_plan_id → meal_plans            | N–1    | CASCADE  | thành phần (composition)   |
| meal_plan_entries.recipe_id → recipes                  | N–1    | RESTRICT |                            |
| notifications.user_id → users                          | N–1    | CASCADE  | ref_id: không FK (đa hình) |
| ai_suggestion_logs.user_id → users                     | N–0..1 | SET NULL |                            |
| refresh_tokens.user_id → users (B4)                    | N–1    | CASCADE  | phiên đăng nhập            |
| push_tokens.user_id → users (B6)                       | N–1    | CASCADE  | thiết bị nhận push         |

## 3. Ràng buộc CHECK (nghiệp vụ ở tầng DB)

| Ràng buộc                                   | Điều kiện                   | BR    |
| ------------------------------------------- | --------------------------- | ----- |
| `chk_fridge_items_quantity`                 | quantity ≥ 0                | BR-03 |
| `chk_inventory_transactions_quantity`       | quantity > 0                | BR-03 |
| `chk_shopping_list_items_expected_quantity` | expected_quantity > 0       |       |
| `chk_recipe_ingredients_quantity`           | quantity > 0                |       |
| `chk_units_factor_to_base`                  | factor_to_base > 0          | BR-04 |
| `chk_categories_default_shelf_life_days`    | default_shelf_life_days ≥ 0 | BR-02 |
| `chk_meal_plans_dates`                      | end_date ≥ start_date       |       |
| `chk_meal_plan_entries_servings`            | servings > 0                |       |

Unique: `uq_users_username`, `uq_users_email`, `uq_categories_name`, `uq_units_symbol`, `uq_foods_name`,
`uq_families_invite_code` (B4), `uq_refresh_tokens_token_hash` (B4), `uq_push_tokens_token` (B6).

Cột bổ sung ngoài §11: `families.invite_code` (B4).

## 4. Máy trạng thái (enum ở `packages/shared/src/enums.ts`)

| Đối tượng         | Trạng thái                                              | Phương thức chuyển                       | Lưu ở đâu              |
| ----------------- | ------------------------------------------------------- | ---------------------------------------- | ---------------------- |
| ShoppingList      | DRAFT → SHOPPING → COMPLETED                            | `startShopping()`, `complete()`          | `status`               |
| ShoppingListItem  | PENDING ⇄ PURCHASED (hoàn tác — B7)                     | `markAsPurchased()`, `unmarkPurchased()` | suy ra `is_purchased`  |
| FridgeItem        | FRESH → EXPIRING_SOON → EXPIRED; → CONSUMED / DISCARDED | `getState(today, lastTxnType)`           | **tính ra**, không lưu |
| Food (đóng góp)   | PENDING → APPROVED / REJECTED                           | `approve()`, `reject()`                  | `approval_status`      |
| Recipe (đóng góp) | PENDING → APPROVED / REJECTED                           | `approve()`, `reject()`                  | `approval_status`      |
| User (tài khoản)  | ACTIVE ⇄ LOCKED                                         | `lock()`, `unlock()`                     | `status`               |

Bảng chuyển hợp lệ khai báo tường minh: `SHOPPING_LIST_TRANSITIONS`, `SHOPPING_LIST_ITEM_TRANSITIONS`,
`FOOD_APPROVAL_TRANSITIONS`, `RECIPE_APPROVAL_TRANSITIONS`. Chuyển sai → `InvalidStateTransitionException` (409).

## 5. Khoá lạc quan

`shopping_list_items.version` (`@VersionColumn`) tăng mỗi lần `save()`. Client gửi `version` đã đọc;
`ShoppingService` so sánh dưới khoá dòng → khác thì 409 `VERSION_CONFLICT` kèm bản mới nhất (NFR §9).

## 5b. Khoá dòng (B7)

Thao tác danh sách mua sắm khoá `shopping_lists` rồi mới tới `shopping_list_items`; thao tác kho khoá
các `fridge_items` liên quan theo thứ tự `id` (`SELECT … FOR UPDATE`). Mọi thay đổi `fridge_items.quantity`
đi kèm một dòng `inventory_transactions` trong cùng transaction; lô không bao giờ bị xoá (giữ lịch sử
cho báo cáo FR-21..23).

## 6. Lệnh

```bash
pnpm migration:run        # áp dụng migration
pnpm migration:check      # báo lỗi nếu entity đã sửa mà chưa sinh migration
pnpm migration:generate src/database/migrations/<TenThayDoi>
pnpm seed                 # dữ liệu mẫu, chạy lại nhiều lần an toàn
```

## 7. Dữ liệu mẫu (chỉ môi trường dev)

| Tài khoản    | Mật khẩu    | Vai trò   | Gia đình                                |
| ------------ | ----------- | --------- | --------------------------------------- |
| `admin`      | `Admin@123` | ADMIN     | —                                       |
| `noitro`     | `Demo@123`  | HOMEMAKER | Gia đình Demo (chủ) — mã mời `DEMO2026` |
| `thanhvien1` | `Demo@123`  | MEMBER    | Gia đình Demo — dị ứng Tôm              |
| `thanhvien2` | `Demo@123`  | MEMBER    | Gia đình Demo                           |

12 danh mục · 18 đơn vị · 74 thực phẩm · 10 công thức (58 nguyên liệu) · 13 lô trong kho
(có các mốc hạn −1/0/1/3/4 ngày cho BR-01) · 1 danh sách mua sắm nháp hôm nay (5 mặt hàng) ·
nội dung chờ duyệt: thực phẩm "Rau dền" (gia đình demo đề xuất) và công thức "Canh rau dền tôm" (thanhvien2).
Seed từ chối chạy khi `NODE_ENV=production`.
