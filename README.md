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
- **pnpm 12** — bật qua Corepack: `corepack enable` (phiên bản lấy từ trường `packageManager`)
- **Docker Desktop** (Postgres, Redis, MailHog, pgAdmin)
- **Git**
- Chạy app mobile: ứng dụng **Expo Go** trên điện thoại, hoặc Android Studio (emulator) / Xcode (simulator)

## Bắt đầu nhanh

```bash
# 1. Cài dependencies (tự cài husky hooks)
corepack enable
pnpm install

# 2. Biến môi trường
cp apps/backend/.env.example apps/backend/.env
cp apps/mobile/.env.example apps/mobile/.env

# 3. Hạ tầng dev
pnpm infra:up            # = docker compose up -d
docker compose ps        # tất cả phải ở trạng thái "healthy"

# 4. Chạy
pnpm dev:backend         # http://localhost:3000
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

| Lệnh                                   | Mục đích                         |
| -------------------------------------- | -------------------------------- |
| `pnpm lint` / `pnpm lint:fix`          | ESLint cho mọi workspace         |
| `pnpm typecheck`                       | `tsc --noEmit` cho mọi workspace |
| `pnpm format` / `pnpm format:check`    | Prettier                         |
| `pnpm test` / `pnpm test:backend`      | Jest                             |
| `pnpm --filter @dctl/backend test:e2e` | Test e2e backend (Supertest)     |
| `pnpm --filter @dctl/backend <script>` | Chạy script riêng của backend    |
| `pnpm --filter @dctl/mobile android`   | Mở app trên Android emulator     |

`lint`, `typecheck`, `test` tự build `packages/shared` trước (backend dùng bản build `dist/`, mobile đọc thẳng `src/` qua Metro).

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
