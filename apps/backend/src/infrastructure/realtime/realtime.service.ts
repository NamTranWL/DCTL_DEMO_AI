import { familyRoom, type RealtimeEventPayloads, userRoom } from '@dctl/shared';
import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { type RealtimeNamespace } from './realtime.types';

/**
 * Phát sự kiện realtime cho feature module (Observer: service → event → gateway broadcast).
 * Mọi thao tác chạy qua Redis adapter nên đúng cả khi chạy nhiều instance backend.
 * Gọi khi chưa có WebSocket server (vd unit test) → bỏ qua kèm cảnh báo.
 * @uc UC-SHOP-02, UC-SHOP-03  @fr FR-06, FR-07  @br BR-06
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  /**
   * Gửi sự kiện tới mọi thiết bị của các thành viên một gia đình (room `family:{id}`).
   * familyId phải lấy từ dữ liệu phía server, không từ client (BR-06).
   * @fr FR-06, FR-07  @br BR-06
   */
  emitToFamily<E extends keyof RealtimeEventPayloads>(
    familyId: string,
    event: E,
    payload: RealtimeEventPayloads[E],
  ): void {
    this.send(familyRoom(familyId), event, payload);
  }

  /** Gửi sự kiện tới mọi thiết bị của một người dùng (room `user:{id}`). */
  emitToUser<E extends keyof RealtimeEventPayloads>(
    userId: string,
    event: E,
    payload: RealtimeEventPayloads[E],
  ): void {
    this.send(userRoom(userId), event, payload);
  }

  /**
   * Đưa mọi kết nối của người dùng vào room gia đình (vừa tạo/tham gia gia đình).
   * Socket.IO applies it immediately on this instance and via Redis on the others (async, ms).
   * @br BR-06
   */
  joinFamilyRoom(userId: string, familyId: string): void {
    this.server()?.in(userRoom(userId)).socketsJoin(familyRoom(familyId));
  }

  /** Đưa mọi kết nối của người dùng ra khỏi room gia đình (rời/bị xoá/giải tán). @br BR-06 */
  leaveFamilyRoom(userId: string, familyId: string): void {
    this.server()?.in(userRoom(userId)).socketsLeave(familyRoom(familyId));
  }

  /** Ngắt mọi kết nối của một người dùng (vd tài khoản bị khoá). */
  disconnectUser(userId: string): void {
    this.server()?.in(userRoom(userId)).disconnectSockets(true);
  }

  /**
   * Broadcast to a room. Socket.IO's typed `emit` cannot narrow a generic event name, so the
   * (already type-checked) payload is passed through an untyped signature here, once.
   */
  private send(room: string, event: string, payload: unknown): void {
    const target = this.server()?.to(room);
    if (target) {
      (target.emit as (name: string, data: unknown) => boolean).call(target, event, payload);
    }
  }

  private server(): RealtimeNamespace | null {
    const namespace = this.gateway.namespace;
    if (!namespace) {
      this.logger.warn('WebSocket server not initialized — realtime event dropped');
    }
    return namespace;
  }
}
