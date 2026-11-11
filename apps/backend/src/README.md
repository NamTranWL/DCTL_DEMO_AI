# apps/backend/src — cấu trúc

Kiến trúc phân lớp theo PROJECT_CONTEXT.md §10. Phụ thuộc chỉ đi **xuống**:
`modules/*` → `common`, `config`, `database`, `infrastructure`; không có chiều ngược lại.

```
src/
├── main.ts                 Khởi động app (đọc PORT, CORS từ config)
├── app.module.ts           Module gốc + pipeline toàn cục (pipe, filter, interceptor)
├── app.setup.ts            Prefix /api, CORS, Swagger — dùng chung cho main.ts và e2e test
├── config/                 Biến môi trường (zod), namespace cấu hình, Swagger
├── common/                 Thành phần dùng chung, KHÔNG chứa nghiệp vụ
│   ├── decorators/         @SkipTransform() (B4 thêm @CurrentUser, @Roles, @Public)
│   ├── exceptions/         ErrorCode, AppException → { code, message, details }
│   ├── filters/            HttpExceptionFilter
│   ├── guards/             (B4) JwtAuthGuard, RolesGuard, FamilyMemberGuard
│   ├── interceptors/       LoggingInterceptor (FR-27), TransformInterceptor ({ data })
│   ├── pipes/              ValidationPipe toàn cục
│   └── utils/              Hàm tiện ích thuần
├── database/               TypeORM: options dùng chung, data-source (CLI), naming, migrations, seeds
├── infrastructure/         Kết nối kỹ thuật dùng chung: redis, health, queue (BullMQ), realtime (Socket.IO)
└── modules/                Module nghiệp vụ theo §10 (B3+)
```

## Luồng xử lý một request REST

```
HTTP → [ValidationPipe] → Controller → Service → Repository → Entity/DB
            │ lỗi                                   │
            ▼                                       ▼
  HttpExceptionFilter → { code, message, details }   TransformInterceptor → { data }
                     (LoggingInterceptor đo thời gian toàn bộ request, header X-Response-Time)
```

## Quy ước

- Mỗi module nghiệp vụ: `modules/<tên>/` gồm `<tên>.module.ts`, `<tên>.controller.ts`,
  `<tên>.service.ts`, `entities/*.entity.ts`, `dto/*.dto.ts`, `events.ts`, `*.spec.ts`, `README.md`.
- Entity dùng camelCase; `SnakeNamingStrategy` sinh tên cột snake_case đúng §11
  (`familyId` → `family_id`). Tên bảng luôn khai báo rõ: `@Entity('fridge_items')`.
- Lỗi nghiệp vụ: `throw new AppException(ErrorCode.X, 'Thông điệp tiếng Việt', HttpStatus.Y)`.
- Controller gắn `@ApiTags(ApiTag.<Module>)` để Swagger nhóm theo module.
