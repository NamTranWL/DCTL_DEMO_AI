/**
 * Machine-readable error codes returned in `{ code, message, details }`.
 * The mobile app switches on `code`; `message` is the Vietnamese text shown to users.
 * Feature modules add their own business codes here (prefixed by module) as they are built.
 */
export enum ErrorCode {
  // --- Generic (mapped from HTTP status) ---
  BadRequest = 'BAD_REQUEST',
  ValidationError = 'VALIDATION_ERROR',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  MethodNotAllowed = 'METHOD_NOT_ALLOWED',
  Conflict = 'CONFLICT',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
  UnprocessableEntity = 'UNPROCESSABLE_ENTITY',
  TooManyRequests = 'TOO_MANY_REQUESTS',
  InternalError = 'INTERNAL_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  GatewayTimeout = 'GATEWAY_TIMEOUT',

  // --- Database constraint violations (PostgreSQL SQLSTATE) ---
  UniqueViolation = 'UNIQUE_VIOLATION',
  ForeignKeyViolation = 'FOREIGN_KEY_VIOLATION',
  /** Optimistic lock conflict (e.g. concurrent shopping item update — NFR §9). */
  VersionConflict = 'VERSION_CONFLICT',

  // --- Domain rules ---
  /** A state machine transition that is not allowed (e.g. COMPLETED → DRAFT). */
  InvalidStateTransition = 'INVALID_STATE_TRANSITION',
  /** Quantity would become zero/negative or is not positive (BR-03). */
  InvalidQuantity = 'INVALID_QUANTITY',

  // --- auth (UC-AUTH-01/02) ---
  InvalidCredentials = 'AUTH_INVALID_CREDENTIALS',
  AccountLocked = 'AUTH_ACCOUNT_LOCKED',
  TokenMissing = 'AUTH_TOKEN_MISSING',
  TokenInvalid = 'AUTH_TOKEN_INVALID',
  TokenExpired = 'AUTH_TOKEN_EXPIRED',
  RefreshTokenInvalid = 'AUTH_REFRESH_TOKEN_INVALID',
  UsernameTaken = 'AUTH_USERNAME_TAKEN',
  EmailTaken = 'AUTH_EMAIL_TAKEN',
  WrongCurrentPassword = 'AUTH_WRONG_CURRENT_PASSWORD',
  SamePassword = 'AUTH_SAME_PASSWORD',

  // --- families (UC-FAM-01, BR-06, BR-11) ---
  FamilyRequired = 'FAMILY_REQUIRED',
  AlreadyInFamily = 'FAMILY_ALREADY_JOINED',
  InviteCodeInvalid = 'FAMILY_INVITE_CODE_INVALID',
  NotFamilyOwner = 'FAMILY_NOT_OWNER',
  MemberNotFound = 'FAMILY_MEMBER_NOT_FOUND',
  CannotRemoveSelf = 'FAMILY_CANNOT_REMOVE_SELF',
  OwnerMustTransfer = 'FAMILY_OWNER_MUST_TRANSFER',

  // --- master-data (UC-ADM-02/03, BR-04, BR-08) ---
  MasterDataInUse = 'MASTER_DATA_IN_USE',
  CategoryNameTaken = 'CATEGORY_NAME_TAKEN',
  UnitSymbolTaken = 'UNIT_SYMBOL_TAKEN',
  UnitIncompatible = 'UNIT_INCOMPATIBLE',
  InvalidBaseUnit = 'UNIT_INVALID_BASE',
  UnitHasDerived = 'UNIT_HAS_DERIVED',
  FoodNameTaken = 'FOOD_NAME_TAKEN',
  FoodPendingReview = 'FOOD_PENDING_REVIEW',
  FoodRejected = 'FOOD_REJECTED',
  FoodInUse = 'FOOD_IN_USE',
  FoodNotAvailable = 'FOOD_NOT_AVAILABLE',
  RecipeNotEditable = 'RECIPE_NOT_EDITABLE',
  DuplicateIngredient = 'RECIPE_DUPLICATE_INGREDIENT',

  // --- shopping (UC-SHOP-01..03, BR-02) ---
  NothingPurchased = 'SHOPPING_NOTHING_PURCHASED',

  // --- fridge (UC-FRIDGE-01..03, BR-03) ---
  InsufficientStock = 'FRIDGE_INSUFFICIENT_STOCK',
}

/** Default Vietnamese message for each code, used when no specific message is given. */
export const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.BadRequest]: 'Yêu cầu không hợp lệ.',
  [ErrorCode.ValidationError]: 'Dữ liệu gửi lên không hợp lệ.',
  [ErrorCode.Unauthorized]: 'Bạn cần đăng nhập để tiếp tục.',
  [ErrorCode.Forbidden]: 'Bạn không có quyền thực hiện thao tác này.',
  [ErrorCode.NotFound]: 'Không tìm thấy dữ liệu yêu cầu.',
  [ErrorCode.MethodNotAllowed]: 'Phương thức không được hỗ trợ.',
  [ErrorCode.Conflict]: 'Dữ liệu bị xung đột, vui lòng tải lại và thử lại.',
  [ErrorCode.PayloadTooLarge]: 'Dữ liệu gửi lên quá lớn.',
  [ErrorCode.UnprocessableEntity]: 'Không thể xử lý yêu cầu.',
  [ErrorCode.TooManyRequests]: 'Bạn thao tác quá nhanh, vui lòng thử lại sau.',
  [ErrorCode.InternalError]: 'Hệ thống gặp sự cố, vui lòng thử lại sau.',
  [ErrorCode.ServiceUnavailable]: 'Dịch vụ tạm thời không khả dụng, vui lòng thử lại sau.',
  [ErrorCode.GatewayTimeout]: 'Hệ thống phản hồi quá lâu, vui lòng thử lại sau.',
  [ErrorCode.UniqueViolation]: 'Dữ liệu đã tồn tại.',
  [ErrorCode.ForeignKeyViolation]: 'Dữ liệu liên quan không tồn tại hoặc đang được sử dụng.',
  [ErrorCode.VersionConflict]: 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại.',
  [ErrorCode.InvalidStateTransition]: 'Không thể thực hiện thao tác ở trạng thái hiện tại.',
  [ErrorCode.InvalidQuantity]: 'Số lượng không hợp lệ.',
  [ErrorCode.InvalidCredentials]: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  [ErrorCode.AccountLocked]: 'Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên.',
  [ErrorCode.TokenMissing]: 'Bạn cần đăng nhập để tiếp tục.',
  [ErrorCode.TokenInvalid]: 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.',
  [ErrorCode.TokenExpired]: 'Phiên đăng nhập đã hết hạn.',
  [ErrorCode.RefreshTokenInvalid]: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  [ErrorCode.UsernameTaken]: 'Tên đăng nhập đã được sử dụng.',
  [ErrorCode.EmailTaken]: 'Email đã được sử dụng.',
  [ErrorCode.WrongCurrentPassword]: 'Mật khẩu hiện tại không đúng.',
  [ErrorCode.SamePassword]: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  [ErrorCode.FamilyRequired]: 'Bạn cần tạo hoặc tham gia một gia đình trước.',
  [ErrorCode.AlreadyInFamily]:
    'Bạn đang thuộc một gia đình. Hãy rời gia đình hiện tại trước khi tham gia gia đình khác.',
  [ErrorCode.InviteCodeInvalid]: 'Mã mời không đúng hoặc đã được đổi.',
  [ErrorCode.NotFamilyOwner]: 'Chỉ chủ gia đình mới thực hiện được thao tác này.',
  [ErrorCode.MemberNotFound]: 'Không tìm thấy thành viên này trong gia đình của bạn.',
  [ErrorCode.CannotRemoveSelf]: 'Bạn không thể tự xoá mình. Hãy dùng chức năng rời gia đình.',
  [ErrorCode.OwnerMustTransfer]:
    'Bạn là chủ gia đình. Hãy chuyển quyền chủ cho thành viên khác trước khi rời.',
  [ErrorCode.MasterDataInUse]: 'Dữ liệu này đang được sử dụng nên không thể xoá.',
  [ErrorCode.CategoryNameTaken]: 'Tên danh mục đã tồn tại.',
  [ErrorCode.UnitSymbolTaken]: 'Ký hiệu đơn vị đã tồn tại.',
  [ErrorCode.UnitIncompatible]: 'Hai đơn vị không cùng nhóm nên không thể quy đổi.',
  [ErrorCode.InvalidBaseUnit]: 'Đơn vị gốc không hợp lệ.',
  [ErrorCode.UnitHasDerived]:
    'Đơn vị này đang là đơn vị gốc của đơn vị khác nên không thể chuyển thành đơn vị dẫn xuất.',
  [ErrorCode.FoodNameTaken]: 'Tên thực phẩm đã tồn tại.',
  [ErrorCode.FoodPendingReview]:
    'Tên thực phẩm này đã được đề xuất và đang chờ duyệt. Bạn vẫn có thể nhập tên tự do.',
  [ErrorCode.FoodRejected]: 'Tên thực phẩm này đã bị từ chối. Bạn vẫn có thể nhập tên tự do.',
  [ErrorCode.FoodInUse]:
    'Thực phẩm đang được dùng trong kho, danh sách mua hoặc công thức nên không thể xoá.',
  [ErrorCode.FoodNotAvailable]: 'Thực phẩm không tồn tại hoặc bạn không được dùng.',
  [ErrorCode.RecipeNotEditable]: 'Chỉ sửa/xoá được công thức của bạn khi đang chờ duyệt.',
  [ErrorCode.DuplicateIngredient]: 'Một nguyên liệu bị nhập trùng trong công thức.',
  [ErrorCode.NothingPurchased]:
    'Chưa có mặt hàng nào được đánh dấu đã mua nên chưa thể hoàn tất chuyến đi chợ.',
  [ErrorCode.InsufficientStock]: 'Số lượng trong kho không đủ.',
};
