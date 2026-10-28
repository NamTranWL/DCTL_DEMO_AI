/**
 * Realtime conventions shared by the NestJS Socket.IO gateway and socket.io-client.
 * Mỗi gia đình có một room riêng `family:{familyId}`; sự kiện chỉ phát trong room đó (BR-06).
 */

/** Prefix of the per-family Socket.IO room. */
export const FAMILY_ROOM_PREFIX = 'family:' as const;

/** Socket.IO namespace used by the realtime gateway. */
export const REALTIME_NAMESPACE = '/realtime' as const;

/**
 * Build the room name for a family.
 * @br BR-06
 */
export function familyRoom(familyId: string): `${typeof FAMILY_ROOM_PREFIX}${string}` {
  if (familyId.trim().length === 0) {
    throw new Error('familyId must be a non-empty string');
  }
  return `${FAMILY_ROOM_PREFIX}${familyId}`;
}
