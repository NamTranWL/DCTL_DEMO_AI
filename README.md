# Đi chợ Tiện lợi (Chủ đề 04)

Ứng dụng di động quản lý thực phẩm gia đình: **danh sách mua sắm → kho (tủ lạnh) → thực đơn**, kèm gợi ý món bằng AI bám sát nguyên liệu thực có.
Nguồn sự thật duy nhất cho nghiệp vụ, tên gọi và kiến trúc: `PROJECT_CONTEXT.md` (trong Project của nhóm).

## Công nghệ

| Phần            | Công nghệ                                                      |
| --------------- | -------------------------------------------------------------- |
| Mobile          | React Native (Expo SDK 58) · TypeScript                        |
| Backend         | NestJS 11 · REST + Socket.IO Gateway                           |
| CSDL            | PostgreSQL 16 · TypeORM                                        |
| Hàng đợi / Cron | Redis 7 · BullMQ · `@nestjs/schedule`                          |
| Xác thực        | JWT (REST và handshake WebSocket)                              |
| Chất lượng      | TypeScript strict · ESLint 9 · Prettier · Jest · Supertest     |
| Quy trình       | pnpm workspaces · husky · lint-staged · commitlint · GitHub CI |

## Yêu cầu môi trường

- **Node.js ≥ 22.12** (xem `.nvmrc`)
- **pnpm 10.34.9** — qua Corepack (phiên bản lấy từ trường `packageManager`). Nếu `pnpm -v` chưa chạy được: `corepack enable` (Windows + nvm-windows: mở PowerShell **Run as Administrator**) hoặc `npm install -g pnpm@10.34.9`. Không dùng pnpm 11/12 — corepack đi kèm Node 22 chưa chạy được các bản này.
- **Docker Desktop** (Postgres, Redis, MailHog, pgAdmin)
- **Git**
- Chạy app mobile: ứng dụng **Expo Go** trên điện thoại, hoặc Android Studio (emulator) / Xcode (simulator)

## Bắt đầu nhanh

```bash
# 1. Cài dependencies (tự cài husky hooks; cần đã có thư mục .git)
pnpm -v                  # phải ra 10.34.9
pnpm install

# 2. Biến môi trường
cp apps/backend/.env.example apps/backend/.env
cp apps/mobile/.env.example apps/mobile/.env

# 3. Hạ tầng dev
pnpm infra:up            # = docker compose up -d
docker compose ps        # tất cả phải ở trạng thái "healthy"

# 4. Tạo bảng + dữ liệu mẫu (tài khoản demo: noitro / Demo@123, admin / Admin@123)
pnpm migration:run
pnpm seed

# 5. Chạy
pnpm dev:backend         # API http://localhost:3000/api · Swagger /api/docs · Health /health
pnpm dev:mobile          # Expo dev server, quét QR bằng Expo Go
```

> Windows (PowerShell): thay `cp` bằng `Copy-Item`.
> Chạy app trên điện thoại thật/emulator: sửa `EXPO_PUBLIC_API_URL` trong `apps/mobile/.env` sang IP LAN của máy (hoặc `10.0.2.2` cho Android emulator).

## Dịch vụ dev (docker-compose)

| Dịch vụ    | Địa chỉ                                              | Ghi chú                                      |
| ---------- | ---------------------------------------------------- | -------------------------------------------- |
| PostgreSQL | `localhost:5432` · db `dctl` · user `dctl`           | Có sẵn extension unaccent, pg_trgm, pgcrypto |
| Redis      | `localhost:6379`                                     | Bật AOF để job BullMQ không mất khi restart  |
| MailHog    | SMTP `localhost:1025` · Web <http://localhost:8025>  | Xem email nhắc hạn (FR-10)                   |
| pgAdmin    | <http://localhost:5050> · `admin@dctl.dev` / `admin` | Server "dctl (docker)" đã khai báo sẵn       |

Dừng: `pnpm infra:down` · Xoá cả dữ liệu: `docker compose down -v`.

## Lệnh thường dùng

| Lệnh                                                    | Mục đích                                          |
| ------------------------------------------------------- | ------------------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`                           | ESLint cho mọi workspace                          |
| `pnpm typecheck`                                        | `tsc --noEmit` cho mọi workspace                  |
| `pnpm format` / `pnpm format:check`                     | Prettier                                          |
| `pnpm test` / `pnpm test:backend`                       | Jest                                              |
| `pnpm test:e2e`                                         | Test e2e backend (cần Postgres + Redis đang chạy) |
| `pnpm migration:generate src/database/migrations/<Tên>` | Sinh migration từ thay đổi entity                 |
| `pnpm migration:run` / `migration:revert`               | Chạy / hoàn tác migration                         |
| `pnpm migration:check`                                  | Báo lỗi nếu entity đã sửa mà chưa sinh migration  |
| `pnpm seed`                                             | Nạp dữ liệu mẫu (chạy lại nhiều lần an toàn)      |
| `pnpm --filter @dctl/backend <script>`                  | Chạy script riêng của backend                     |
| `pnpm --filter @dctl/mobile android`                    | Mở app trên Android emulator                      |

`lint`, `typecheck`, `test` tự build `packages/shared` trước (backend dùng bản build `dist/`, mobile đọc thẳng `src/` qua Metro).

## API nhanh

Swagger: <http://localhost:3000/api/docs> (bấm **Authorize**, dán `accessToken`).

```bash
# Đăng nhập tài khoản demo → lấy accessToken
curl -X POST localhost:3000/api/auth/login -H "content-type: application/json" \
  -d '{"login":"noitro","password":"Demo@123"}'
# Gia đình của tôi
curl localhost:3000/api/families/me -H "authorization: Bearer <accessToken>"
```

Luồng 5.1 (danh sách mua sắm → kho), chi tiết `apps/backend/src/modules/shopping/README.md`:

```bash
# noitro (nội trợ) lập danh sách; thanhvien1 đánh dấu đã mua rồi hoàn tất → tự nhập kho
POST /api/shopping-lists                             {"targetDate":"<hôm nay>","items":[...]}
POST /api/shopping-lists/:listId/items/:itemId/purchase   {"version":1}
POST /api/shopping-lists/:listId/complete            {}
GET  /api/fridge/items?q=ca chua                     # tìm không dấu
POST /api/fridge/consume                             {"items":[{"foodId":"…","quantity":300,"unitId":"<g>"}]}
```

Realtime: Socket.IO `ws://localhost:3000/realtime`, gửi `auth: { token: accessToken }` khi kết nối
(chi tiết `apps/backend/src/infrastructure/README.md`). Thử email: đăng nhập `admin`, gọi
`POST /api/admin/notifications/test`, mở MailHog <http://localhost:8025>.

Mọi endpoint cần JWT trừ `@Public()` (đăng ký, đăng nhập, refresh, logout, health).
Mã mời gia đình demo: `DEMO2026`. Chi tiết: `apps/backend/src/modules/{auth,families}/README.md`.

## Cấu trúc thư mục

```
.
├── apps/
│   ├── backend/            NestJS — src/modules/<module> theo PROJECT_CONTEXT §10
│   │   ├── src/            (B2: config, common, database, modules)
│   │   └── test/           e2e tests
│   └── mobile/             React Native (Expo) — src/app, src/features, src/shared, src/services (B10)
├── packages/
│   └── shared/             @dctl/shared — enum, type, hằng số sự kiện dùng chung
├── docker/                 script khởi tạo Postgres, cấu hình pgAdmin
├── .github/workflows/      CI: install → format → lint → typecheck → test (Postgres + Redis)
├── docker-compose.yml
├── eslint.config.mjs       ESLint dùng chung (flat config)
├── commitlint.config.mjs   Quy ước commit
└── tsconfig.base.json      TypeScript strict dùng chung
```

## Quy ước Git

- Nhánh: `main` (ổn định) · `develop` · `feature/<mã-UC>-<mô-tả>` (vd: `feature/UC-SHOP-03-complete-trip`).
- Commit theo **Conventional Commits**, **bắt buộc có scope** = tên module hoặc mã UC (có thể ghép bằng dấu phẩy):

  ```
  feat(shopping,UC-SHOP-03): hoàn tất chuyến đi chợ và nhập kho
  fix(fridge): trừ kho theo FEFO
  chore(infra): thêm MailHog
  ```

  Scope hợp lệ: `auth users families master-data fridge shopping meal-plan ai notifications reports admin backend mobile shared infra ci deps docs release` hoặc mã dạng `UC-XXX-00`.

- Pre-commit chạy ESLint + Prettier trên file đã stage; commit-msg chạy commitlint.
- Mọi thay đổi vào `develop`/`main` qua Pull Request, CI phải xanh.

## Quy tắc code (tóm tắt)

Tên module/entity/bảng/cột/enum đúng `PROJECT_CONTEXT.md` §10–11 · JSDoc nghiệp vụ có `@uc @fr @br` · trạng thái bằng enum, chuyển trạng thái qua phương thức có tên rõ · sự kiện domain là hằng số trong `events.ts` · controller → service → repository → entity · `family_id` luôn lấy từ JWT (BR-06) · code/comment kỹ thuật tiếng Anh, thông điệp cho người dùng tiếng Việt.
