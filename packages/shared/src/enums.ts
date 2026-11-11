/**
 * Domain enums shared by backend (TypeORM columns, validation) and mobile (UI labels, filters).
 * Values are the exact strings stored in PostgreSQL — never rename a value without a migration.
 * Source: PROJECT_CONTEXT.md §3, §4 (BR-xx), §10 (state machines), §11 (tables).
 */

/** users.role — vai trò hệ thống. HOMEMAKER = Người nội trợ, MEMBER = Thành viên gia đình. */
export enum UserRole {
  Admin = 'ADMIN',
  Homemaker = 'HOMEMAKER',
  Member = 'MEMBER',
}

/** users.status — trạng thái tài khoản (Admin khoá/mở, UC-ADM-01). */
export enum UserStatus {
  Active = 'ACTIVE',
  Locked = 'LOCKED',
}

/**
 * foods.approval_status, recipes.approval_status — kiểm duyệt nội dung đóng góp (BR-04, BR-08).
 * State machine: PENDING → APPROVED | REJECTED.
 */
export enum ApprovalStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
}

/** recipes.source — nguồn gốc công thức. */
export enum RecipeSource {
  /** Công thức chuẩn do Admin quản lý (FR-25). */
  System = 'SYSTEM',
  /** Công thức người dùng đóng góp, cần Admin duyệt (FR-26, BR-08). */
  User = 'USER',
}

/**
 * shopping_lists.status. State machine: DRAFT (Nháp) → SHOPPING (Đang mua) → COMPLETED (Hoàn tất).
 * COMPLETED triggers the automatic fridge import (FR-08, BR-02).
 */
export enum ShoppingListStatus {
  Draft = 'DRAFT',
  Shopping = 'SHOPPING',
  Completed = 'COMPLETED',
}

/**
 * Trạng thái một mặt hàng, suy ra từ shopping_list_items.is_purchased (không lưu riêng).
 * State machine: PENDING (Chưa mua) → PURCHASED (Đã mua).
 */
export enum ShoppingListItemStatus {
  Pending = 'PENDING',
  Purchased = 'PURCHASED',
}

/** shopping_lists.period_type, meal_plans.period_type — lập theo ngày hay tuần (FR-04, FR-14). */
export enum PeriodType {
  Day = 'DAY',
  Week = 'WEEK',
}

/** fridge_items.storage_location — vị trí lưu trữ (FR-09). */
export enum StorageLocation {
  /** Ngăn mát */
  Fridge = 'FRIDGE',
  /** Ngăn đá */
  Freezer = 'FREEZER',
  /** Tủ bếp / đồ khô */
  Pantry = 'PANTRY',
}

/** inventory_transactions.type — mọi thay đổi tồn kho (FR-13, BR-03, BR-05). */
export enum InventoryTransactionType {
  Add = 'ADD',
  Consume = 'CONSUME',
  /** Huỷ — tính là lãng phí (BR-05, FR-23). */
  Discard = 'DISCARD',
  Adjust = 'ADJUST',
}

/**
 * Trạng thái của một lô thực phẩm trong kho — KHÔNG lưu cột, luôn tính ra (quyết định B3):
 * - FRESH / EXPIRING_SOON / EXPIRED từ expiry_date theo BR-01;
 * - CONSUMED / DISCARDED khi quantity = 0, theo loại giao dịch cuối cùng.
 * State machine: FRESH → EXPIRING_SOON → EXPIRED; mọi trạng thái còn hàng → CONSUMED | DISCARDED.
 */
export enum FridgeItemState {
  Fresh = 'FRESH',
  ExpiringSoon = 'EXPIRING_SOON',
  Expired = 'EXPIRED',
  Consumed = 'CONSUMED',
  Discarded = 'DISCARDED',
}

/** meal_plan_entries.meal_type — bữa ăn. */
export enum MealType {
  Breakfast = 'BREAKFAST',
  Lunch = 'LUNCH',
  Dinner = 'DINNER',
  Snack = 'SNACK',
}

/** notifications.type — loại thông báo gửi cho người dùng. */
export enum NotificationType {
  /** Thực phẩm sắp hết hạn (BR-01, FR-10). */
  ExpirySoon = 'EXPIRY_SOON',
  /** Thực phẩm đã hết hạn (BR-01, FR-10). */
  Expired = 'EXPIRED',
  /** Danh sách mua sắm được chia sẻ trong nhóm (FR-06). */
  ShoppingListShared = 'SHOPPING_LIST_SHARED',
  /** Được phân công mua một mặt hàng (FR-03). */
  ShoppingItemAssigned = 'SHOPPING_ITEM_ASSIGNED',
  /** Chuyến đi chợ đã hoàn tất, đã nhập kho (FR-08). */
  ShoppingTripCompleted = 'SHOPPING_TRIP_COMPLETED',
  /** Nội dung đóng góp được duyệt / từ chối (FR-26). */
  ContentApproved = 'CONTENT_APPROVED',
  ContentRejected = 'CONTENT_REJECTED',
  /** Nhắc mua sớm theo dự đoán tiêu thụ (FR-29, bonus). */
  PurchaseReminder = 'PURCHASE_REMINDER',
}

/** push_tokens.platform — nền tảng thiết bị nhận push (B6). */
export enum PushPlatform {
  Ios = 'IOS',
  Android = 'ANDROID',
}
