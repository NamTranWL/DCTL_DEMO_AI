# Module `auth` — UC-AUTH-01/02, FR-01

## Thành phần

| Lớp                      | Loại           | Vai trò                                                             |
| ------------------------ | -------------- | ------------------------------------------------------------------- |
| `AuthController`         | boundary       | `/api/auth/*`                                                       |
| `AuthService`            | control        | đăng ký, đăng nhập, làm mới, đăng xuất, đổi mật khẩu                |
| `TokenService`           | control        | ký/kiểm tra JWT; cấp, xoay vòng, thu hồi refresh token              |
| `PasswordHasher`         | control        | bcrypt (cost 10)                                                    |
| `RefreshTokenRepository` | repository     | bảng `refresh_tokens`                                               |
| `RefreshToken`           | entity         | `token_hash` (SHA-256), `expires_at`, `revoked_at`                  |
| `JwtAuthGuard`           | guard toàn cục | bắt buộc JWT (trừ `@Public()`), nạp lại user từ DB → `request.user` |
| `RolesGuard`             | guard toàn cục | kiểm tra `@Roles(...)`                                              |
| `FamilyMemberGuard`      | guard toàn cục | kiểm tra `@RequireFamily()`                                         |

Decorator (ở `common/decorators/auth.decorators.ts`, không phụ thuộc module này):
`@Public()`, `@Roles()`, `@RequireFamily()`, `@CurrentUser()`, `@CurrentFamilyId()`.

## Endpoint

| Method | Path                        | Public | Kết quả                                       |
| ------ | --------------------------- | ------ | --------------------------------------------- |
| POST   | `/api/auth/register`        | ✓      | 201 `{ tokens…, user }`                       |
| POST   | `/api/auth/login`           | ✓      | 200 `{ tokens…, user }` · 401 · 403 khoá      |
| POST   | `/api/auth/refresh`         | ✓      | 200 cặp token mới · 401                       |
| POST   | `/api/auth/logout`          | ✓      | 204                                           |
| POST   | `/api/auth/change-password` | 🔒     | 200 cặp token mới (mọi phiên khác bị thu hồi) |

## Token

- **Access token**: JWT HS256, sống `JWT_EXPIRES` (mặc định 15 phút), payload `{ sub, role, familyId }`.
- **Refresh token**: chuỗi ngẫu nhiên 48 byte (base64url), sống `JWT_REFRESH_EXPIRES_DAYS` (30 ngày).
  DB chỉ lưu SHA-256. Mỗi lần `/refresh`: token cũ bị thu hồi, cấp token mới (rotation).
  Dùng lại token đã thu hồi → nghi bị lộ → thu hồi **toàn bộ** refresh token của người đó.
- **family_id / role luôn theo DB**: `JwtAuthGuard` nạp lại user mỗi request. Nếu claims trong
  token đã cũ (vừa tham gia/bị xoá khỏi gia đình) → API vẫn dùng giá trị DB và trả header
  `X-Token-Stale: 1` để app gọi `/auth/refresh`.

## Luồng gọi (để vẽ sequence diagram)

**Đăng nhập (UC-AUTH-02)**

```
App → AuthController.login(LoginDto)
  → AuthService.login
      → UsersService.findForLogin(login)        → UserRepository.findByLoginWithPassword
      → PasswordHasher.verify | verifyAgainstDummy   (không lộ tài khoản tồn tại hay không)
      → [status ≠ ACTIVE] → 403 AUTH_ACCOUNT_LOCKED
      → TokenService.issueTokens(user)          → JwtService.signAsync + RefreshTokenRepository.save
  ← { tokenType, accessToken, expiresIn, refreshToken, refreshExpiresAt, user }
```

**Mọi request có bảo vệ**

```
App → JwtAuthGuard.canActivate
        → TokenService.verifyAccessToken(Bearer)   (401 MISSING/INVALID/EXPIRED)
        → UsersService.findAuthUser(sub)           (family_id, role, status theo DB)
        → request.user = AuthUser
    → RolesGuard (@Roles) → FamilyMemberGuard (@RequireFamily) → Controller(@CurrentFamilyId)
```

**Làm mới phiên**

```
App → AuthController.refresh → AuthService.refresh
  → TokenService.consumeRefreshToken (revoke cũ / phát hiện dùng lại)
  → UsersService.getById → TokenService.issueTokens
```

## Máy trạng thái RefreshToken

`ACTIVE → REVOKED` (đăng xuất, xoay vòng, đổi mật khẩu, phát hiện dùng lại) · `ACTIVE → EXPIRED` (quá `expires_at`).
Trạng thái tính từ `revoked_at`, `expires_at` (`RefreshToken.isActive()`).
