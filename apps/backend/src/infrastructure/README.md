# Hạ tầng dùng chung (`src/infrastructure`)

Kết nối kỹ thuật, không chứa nghiệp vụ. Module nghiệp vụ dùng qua DI; hạ tầng **không** import module
nghiệp vụ (xác thực realtime được "cắm" từ AppModule qua interface `RealtimeAuthenticator`).

| Thư mục     | Module           | Cung cấp                                                                |
| ----------- | ---------------- | ----------------------------------------------------------------------- |
| `redis/`    | `RedisModule`    | client ioredis dùng chung (`REDIS_CLIENT`) — health, cache AI (B9)      |
| `health/`   | `HealthModule`   | `GET /health` (DB + Redis)                                              |
| `queue/`    | `QueueModule`    | BullMQ trên Redis, queue `notifications`; `@InjectQueue(QUEUE_NAMES.X)` |
| `realtime/` | `RealtimeModule` | Socket.IO gateway `/realtime` + `RealtimeService` + Redis adapter       |

Cron: `ScheduleModule.forRoot()` đã bật trong AppModule — module nghiệp vụ dùng `@Cron()` (B8).
Domain event: `EventEmitterModule` — `this.events.emit(FAMILY_CREATED, payload)` / `@OnEvent(...)`.

## Hai loại sự kiện (quyết định B6)

| Loại                       | Ở đâu                                    | Ai nghe                       |
| -------------------------- | ---------------------------------------- | ----------------------------- |
| Domain event (nội bộ)      | `src/modules/<module>/events.ts`         | listener backend (`@OnEvent`) |
| Realtime event (xuống app) | `packages/shared/src/events/*-events.ts` | app mobile (`socket.on`)      |

Realtime event theo module: `realtime-events.ts` (system, family — B6), `shopping-events.ts`,
`fridge-events.ts` (B7); gộp lại thành một `REALTIME_EVENTS` và một kiểu `RealtimeEventPayloads`.

Luồng chuẩn (Observer, §10): `Service` đổi dữ liệu → `emit(DOMAIN_EVENT)` → listener của module →
`RealtimeService.emitToFamily(familyId, REALTIME_EVENTS.X, payload)` → mọi thiết bị trong room gia đình.

## Realtime (Socket.IO)

- URL: `${WS_URL}/realtime` (vd `http://localhost:3000/realtime`).
- Xác thực khi bắt tay: `io(url, { auth: { token: accessToken } })` (hoặc header `Authorization: Bearer`).
  Sai/thiếu/hết hạn → `connect_error` với `err.message` = `AUTH_TOKEN_MISSING | AUTH_TOKEN_INVALID |
AUTH_TOKEN_EXPIRED | AUTH_ACCOUNT_LOCKED`, `err.data = { code, message }` (message tiếng Việt).
- Room: `user:{userId}` (mọi thiết bị của 1 người) và `family:{familyId}` (BR-06). Server tự join khi
  kết nối; khi tham gia/rời/bị xoá khỏi gia đình, listener của `families` chuyển room ngay.
- Kết nối xong server gửi `system:ready { userId, familyId, rooms }`.
- Client không gửi lệnh qua socket: thay đổi dữ liệu bằng REST, nhận broadcast qua socket. Mất kết
  nối → khi kết nối lại tải lại trạng thái qua REST (NFR §9).
- Nhiều instance backend: Redis adapter phát sự kiện tới socket ở mọi instance (đã có e2e 2 instance).

```ts
// App (B10) — ví dụ tối giản
import { REALTIME_EVENTS, REALTIME_NAMESPACE } from '@dctl/shared';
const socket = io(`${env.wsUrl}${REALTIME_NAMESPACE}`, {
  auth: { token },
  transports: ['websocket'],
});
socket.on(REALTIME_EVENTS.USER_FAMILY_CHANGED, () => refreshTokenAndReload());
```

### Luồng gọi (sequence diagram)

```
App ──WS handshake(auth.token)──▶ RealtimeGateway.afterInit middleware
        → RealtimeAuthenticator.authenticate(token)   (= AccessTokenAuthenticator: JWT + DB)
        ├─ lỗi → next(Error(code)) → connect_error
        └─ ok  → socket.data.user → handleConnection → join user:/family: → emit system:ready

FamiliesService.joinByInviteCode ─commit─▶ emit(FAMILY_MEMBER_JOINED)
  → FamilyRealtimeListener.onJoined
      → RealtimeService.joinFamilyRoom(userId, familyId)   (in(user:x).socketsJoin(family:y))
      → emitToUser(USER_FAMILY_CHANGED) · emitToFamily(FAMILY_MEMBERS_CHANGED)
```

## Hàng đợi (BullMQ)

- Prefix Redis `dctl:`; mặc định mỗi job: 3 lần thử, back-off mũ 2 s → 4 s, giữ 1 000 job xong, 7 ngày
  job lỗi (`queue.constants.ts`).
- Thêm queue mới: thêm tên vào `QUEUE_NAMES`, `BullModule.registerQueue` trong `QueueModule`, viết
  `@Processor(QUEUE_NAMES.X) class … extends WorkerHost` trong module nghiệp vụ.
