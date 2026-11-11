# Module `notifications` — UC-FRIDGE-04 · FR-10 (B6: hạ tầng gửi; B8: nhắc hạn)

## Thành phần

| Lớp                                                       | Loại                          | Vai trò                                                                      |
| --------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `NotificationQueue`                                       | control (producer)            | `notify({ userId, channels, title, body, data, dedupeKey })` → job           |
| `NotificationsProcessor`                                  | control (worker)              | `@Processor('notifications')` — xử lý job `notification.send`                |
| `NotificationDispatcher`                                  | control                       | tìm email/push token, gọi adapter, dọn token hỏng                            |
| `NotificationSender`                                      | interface (Adapter)           | `send(OutboundNotification): DeliveryResult`                                 |
| `ConsoleSender`                                           | adapter                       | dev — ghi log                                                                |
| `EmailSender`                                             | adapter                       | nodemailer SMTP (dev: MailHog `localhost:1025`, xem <http://localhost:8025>) |
| `ExpoPushSender`                                          | adapter                       | Expo push service (`expo-server-sdk`)                                        |
| `PushTokensService` / `PushTokenRepository` / `PushToken` | control / repository / entity | bảng `push_tokens` (bổ sung B6)                                              |
| `NotificationsController`                                 | boundary                      | `POST/DELETE /api/notifications/push-tokens`                                 |
| `NotificationsAdminController`                            | boundary (Admin)              | `POST /api/admin/notifications/test` — gửi thử                               |

Chọn adapter qua `.env` (không sửa code — NFR §9 bảo trì):

| Biến            | Giá trị            | Adapter                            |
| --------------- | ------------------ | ---------------------------------- |
| `MAIL_PROVIDER` | `smtp` / `console` | `EmailSender` / `ConsoleSender`    |
| `PUSH_PROVIDER` | `expo` / `console` | `ExpoPushSender` / `ConsoleSender` |

## Quy tắc

- **Mỗi kênh một job**: retry email không gửi lặp push.
- **Chống trùng**: `dedupeKey` → `jobId = {dedupeKey}:{channel}`; cùng key không xếp hàng hai lần
  (B8 dùng `expiry:{fridgeItemId}:{yyyy-mm-dd}` cho BR-01 "mỗi mục nhắc tối đa 1 lần/ngày").
- **Retry**: lỗi mạng/SMTP/Expo → ném lỗi → BullMQ thử lại 3 lần (2 s, 4 s). Người dùng không tồn
  tại / kênh không cấu hình → `UnrecoverableError` (không thử lại).
- **Push token**: định dạng Expo; một token thuộc đúng một người dùng (đăng nhập tài khoản khác trên
  cùng máy → token chuyển chủ); token Expo báo `DeviceNotRegistered` bị xoá tự động.
  Phiếu biên nhận (receipt) Expo chưa được kiểm tra trong base.

## Luồng gọi (sequence diagram)

```
Service nghiệp vụ (B8: ExpiryReminderService)
  → NotificationQueue.notify(req)            ── trả về ngay (không chặn request)
      → Queue.add('notification.send', { userId, channel, title, body }) × mỗi kênh
Worker (cùng hoặc khác instance)
  → NotificationsProcessor.process(job)
      → NotificationDispatcher.deliver(job.data)
          → UserRepository.findOne(email) · PushTokenRepository.tokensOf(userId)
          → NotificationSender(channel).send(...)   ── Email: SMTP · Push: Expo
          → PushTokenRepository.deleteTokens(invalid)
      ├─ lỗi tạm thời → BullMQ retry (back-off)
      └─ xong → job completed (kết quả DeliveryResult)
```

## Thử nhanh

```bash
docker compose up -d                      # có MailHog
# .env: MAIL_PROVIDER=smtp, PUSH_PROVIDER=console
curl -X POST localhost:3000/api/admin/notifications/test -H "authorization: Bearer <token admin>"
# → mở http://localhost:8025 thấy thư "Thông báo thử — Đi chợ Tiện lợi"
```
