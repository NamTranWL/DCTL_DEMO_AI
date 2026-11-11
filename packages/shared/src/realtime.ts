/**
 * Realtime conventions shared by the NestJS Socket.IO gateway and socket.io-client.
 * Mỗi gia đình có một room riêng `family:{familyId}`; sự kiện chỉ phát trong room đó (BR-06).
 * Mỗi người dùng có room `user:{userId}` (mọi thiết bị của người đó) để gửi sự kiện cá nhân.
 */

/** Prefix of the per-family Socket.IO room. */
export const FAMILY_ROOM_PREFIX = 'family:' as const;

/** Prefix of the per-user Socket.IO room (all devices of one user). */
export const USER_ROOM_PREFIX = 'user:' as const;

/** Socket.IO namespace used by the realtime gateway. */
export const REALTIME_NAMESPACE = '/realtime' as const;

function requireId(kind: string, id: string): void {
  if (id.trim().length === 0) {
    throw new Error(`${kind} must be a non-empty string`);
  }
}

/**
 * Build the room name for a family.
 * @br BR-06
 */
export function familyRoom(familyId: string): `${typeof FAMILY_ROOM_PREFIX}${string}` {
  requireId('familyId', familyId);
  return `${FAMILY_ROOM_PREFIX}${familyId}`;
}

/** Build the room name for a user (all of their connected devices). */
export function userRoom(userId: string): `${typeof USER_ROOM_PREFIX}${string}` {
  requireId('userId', userId);
  return `${USER_ROOM_PREFIX}${userId}`;
}
