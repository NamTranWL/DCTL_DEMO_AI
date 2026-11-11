# Module `master-data` — UC-ADM-02/03, UC-RCP-01 · FR-05, FR-09, FR-11, FR-12, FR-17, FR-25, FR-26 · BR-04, BR-08

## Thành phần

| Lớp                                | Loại           | Vai trò                                                                       |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `CatalogController`                | boundary       | Người dùng: danh mục, đơn vị, quy đổi, gợi ý tên thực phẩm, đề xuất tên       |
| `RecipesController`                | boundary       | Người dùng: tìm/xem công thức, yêu thích, đóng góp công thức                  |
| `MasterDataAdminController`        | boundary       | Admin: CRUD danh mục, đơn vị, thực phẩm, công thức chuẩn (`/api/admin`)       |
| `ModerationAdminController`        | boundary       | Admin: duyệt/từ chối tên thực phẩm và công thức (`/api/admin/moderation`)     |
| `CategoriesService`                | control        | danh mục                                                                      |
| `UnitsService`                     | control        | đơn vị, quy đổi (dùng `UnitConverter`)                                        |
| `FoodsService`                     | control        | tra cứu không dấu, đề xuất tên, kiểm duyệt, xoá có kiểm tra đang dùng         |
| `RecipesService`                   | control        | công thức, nguyên liệu, kiểm duyệt, yêu thích                                 |
| `UnitConverter`                    | tiện ích thuần | quy đổi trong cùng nhóm đơn vị; khác nhóm → `UNIT_INCOMPATIBLE`               |
| `CatalogItemResolver`              | control        | B7: kiểm tra food/danh mục/đơn vị của mặt hàng mua sắm, lô nhập kho (BR-04)   |
| `normalizeFoodName`, `toSearchKey` | `@dctl/shared` | chuẩn hoá tên / khoá tìm kiếm không dấu (dùng chung backend, mobile, AI)      |
| `*Repository`                      | repository     | `Category`, `Unit`, `Food`, `Recipe`, `FavoriteRecipe` (+ `RecipeIngredient`) |
| `events.ts`                        | sự kiện        | `FOOD_SUBMITTED/APPROVED/REJECTED`, `RECIPE_SUBMITTED/APPROVED/REJECTED`      |

## Endpoint

**Người dùng (đã đăng nhập)**

| Method      | Path                        | Ghi chú                                                                 |
| ----------- | --------------------------- | ----------------------------------------------------------------------- |
| GET         | `/api/categories`           | kèm `storageAdvice`, `defaultShelfLifeDays` (FR-11)                     |
| GET         | `/api/units`                | kèm `groupId` (nhóm quy đổi)                                            |
| GET         | `/api/units/convert`        | `?quantity&fromUnitId&toUnitId` — 422 nếu khác nhóm                     |
| GET         | `/api/foods/search`         | `?q&categoryId&limit` — không dấu; APPROVED + PENDING của gia đình mình |
| POST        | `/api/foods`                | `@RequireFamily` — đề xuất tên: 201 tạo mới / 200 đã có / 409           |
| GET         | `/api/recipes`              | `?q&sort=name                                                           | popular | newest&page&pageSize` |
| GET         | `/api/recipes/favorites`    | công thức yêu thích của tôi                                             |
| GET         | `/api/recipes/:id`          | chi tiết; không được xem → 404                                          |
| POST        | `/api/recipes`              | đóng góp công thức → PENDING                                            |
| PUT         | `/api/recipes/:id`          | chỉ người đóng góp, khi PENDING                                         |
| DELETE      | `/api/recipes/:id`          | chỉ người đóng góp, khi PENDING/REJECTED                                |
| POST/DELETE | `/api/recipes/:id/favorite` | thêm/bỏ yêu thích (idempotent)                                          |

**Admin (`@Roles(ADMIN)`)** — `/api/admin/{categories|units|foods|recipes}` (GET danh sách có lọc
`status`, POST, PATCH/PUT, DELETE) và `/api/admin/moderation/{summary, foods/:id/approve|reject,
recipes/:id/approve|reject}`.

## Quy tắc

- **Tên thực phẩm (BR-04)**: luôn qua `normalizeFoodName()` (NFC, gộp khoảng trắng, viết hoa chữ đầu);
  `foods.name` unique. Giữ dấu ("Cá" ≠ "Cà"); tìm kiếm thì không dấu (`lower(unaccent(name))`).
- **Đề xuất tên** (quyết định B5): tên đã có — APPROVED hoặc PENDING của chính gia đình → trả lại;
  PENDING của gia đình khác → 409 `FOOD_PENDING_REVIEW`; REJECTED → 409 `FOOD_REJECTED`. App vẫn
  lưu kho/danh sách được với `food_id = NULL` và tên tự do.
- **Hiển thị (BR-08)**: thực phẩm PENDING chỉ gia đình đề xuất thấy; công thức PENDING/REJECTED chỉ
  người đóng góp và gia đình hiện tại của họ thấy. Id không được thấy → 404.
- **Nguyên liệu công thức (BR-10)**: chọn `foodId` (phải dùng được) hoặc nhập tên; tên trùng khớp
  một thực phẩm dùng được sẽ tự gắn `food_id`. Không được trùng nguyên liệu.
- **Dinh dưỡng**: không tự đặt số liệu; nếu có số liệu thì bắt buộc ghi nguồn.
- **Xoá master data**: danh mục/đơn vị đang dùng → 409 `MASTER_DATA_IN_USE`; thực phẩm đang dùng ở
  kho/danh sách/công thức → 409 `FOOD_IN_USE` (kèm số chỗ dùng); công thức trong thực đơn → 409.
  Đổi nhóm/hệ số của đơn vị đang dùng → 409.
- **Không phụ thuộc vòng**: đếm chỗ dùng ở `fridge_items`, `shopping_list_items`, `meal_plan_entries`
  bằng SQL thuần, không import entity của module tầng trên.

## Luồng gọi (để vẽ sequence diagram)

**Gợi ý tên thực phẩm khi nhập kho (UC-FRIDGE-01)**

```
App → CatalogController.searchFoods(q) → FoodsService.search(familyId, q)
  → toSearchKey(q)                       ("Thịt BA" → "thit ba")
  → FoodRepository.searchVisible(key, familyId)
       WHERE lower(unaccent(name)) LIKE '%key%'
         AND (approval_status = APPROVED OR (PENDING AND created_by_family_id = familyId))
       ORDER BY khớp đầu tên, khớp đầu từ, độ dài
  ← FoodResponse[] (isPendingOwn)
```

**Đề xuất → kiểm duyệt tên mới (FR-26, UC-ADM-03)**

```
App → CatalogController.contributeFood → FoodsService.contribute(viewer, dto)
  → normalizeFoodName (DTO) → FoodRepository.findByName
  ├─ có sẵn → reuseExisting (trả lại / 409)
  └─ chưa có → FoodRepository.save(PENDING, created_by_family_id) → emit FOOD_SUBMITTED
Admin → ModerationAdminController.approveFood → FoodsService.approve → Food.approve()
  → FoodRepository.save → emit FOOD_APPROVED (B8: thông báo cho gia đình đề xuất)
```

## Máy trạng thái

`Food` và `Recipe` đóng góp: `PENDING → APPROVED | REJECTED` (`approve()`, `reject()`; bảng
`FOOD_APPROVAL_TRANSITIONS`, `RECIPE_APPROVAL_TRANSITIONS`). Thực phẩm/công thức do Admin tạo bắt đầu
ở APPROVED. Chuyển sai (vd duyệt lại một tên đã từ chối) → 409 `INVALID_STATE_TRANSITION`.
