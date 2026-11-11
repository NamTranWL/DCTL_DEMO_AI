# Module nghiệp vụ

Danh sách module theo PROJECT_CONTEXT.md §10 (tên thư mục phải đúng như dưới):

| Module          | UC chính                | Bước base                   |
| --------------- | ----------------------- | --------------------------- |
| `auth`          | UC-AUTH-01/02           | ✅ B4                       |
| `users`         | UC-FAM-02, UC-ADM-01    | ✅ B4                       |
| `families`      | UC-FAM-01               | ✅ B4                       |
| `master-data`   | UC-ADM-02/03, UC-RCP-01 | ✅ B5                       |
| `fridge`        | UC-FRIDGE-01..03        | ✅ B7                       |
| `shopping`      | UC-SHOP-01..03          | ✅ B7 (module mẫu)          |
| `meal-plan`     | UC-MEAL-01/02           | B3                          |
| `ai`            | UC-AI-01                | B9                          |
| `notifications` | UC-FRIDGE-04            | ✅ B6 (gửi) · B8 (nhắc hạn) |
| `reports`       | UC-RPT-01               | sau base                    |
| `admin`         | UC-ADM-01..04           | sau base                    |

Entity đặt trong module sở hữu nó: `modules/<module>/entities/<tên>.entity.ts`
(DataSource tự nạp mọi file `*.entity.ts` trong `modules/`). Bảng ↔ entity ↔ module, quan hệ,
ràng buộc và máy trạng thái: xem `src/database/README.md`.

## Quy tắc phụ thuộc giữa entity

- Chỉ khai báo quan hệ ngược (`@OneToMany`) **trong cùng module** hoặc về phía module tầng dưới,
  để không tạo phụ thuộc vòng giữa module.
- Ngoại lệ duy nhất `users` ↔ `families`: `Family.owner` import thật `User`; còn `User.family`
  khai báo bằng tên chuỗi `'Family'` + `import type` (không phụ thuộc lúc chạy).
- Bảng nối N–N (`favorite_recipes`) là entity tường minh trong `master-data`, không dùng
  `@ManyToMany` trên `User`.

## Khuôn mẫu một module (mẫu chuẩn: `shopping`, B7)

```
modules/<tên>/
├── <tên>.module.ts          khai báo provider/controller, exports
├── <tên>.controller.ts      boundary — chỉ gọi service, @ApiTags, @RequireFamily/@Roles
├── <tên>.service.ts         control — nghiệp vụ, transaction + khoá dòng, phát sự kiện sau commit
├── <tên>.gateway.ts         boundary realtime — @OnEvent → RealtimeService.emitToFamily (nếu có)
├── repositories/*.ts        extends BaseRepository<Entity> (src/database/base.repository.ts)
├── entities/*.entity.ts     entity + phương thức chuyển trạng thái
├── dto/*.ts                 class-validator (thông điệp tiếng Việt) + @ApiProperty
├── events.ts                hằng số sự kiện + class payload
├── *.spec.ts                unit test (mock repository; coverage service ≥ 80%)
└── README.md                thành phần, endpoint, luồng gọi, máy trạng thái
```

Dữ liệu theo gia đình: `@RequireFamily()` + `@CurrentFamilyId() familyId: string` rồi truyền
`familyId` xuống service/repository — không bao giờ đọc family_id từ body/query/params (BR-06).
