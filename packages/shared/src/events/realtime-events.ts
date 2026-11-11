/**
 * Realtime events sent by the server to apps over Socket.IO (namespace `/realtime`).
 * Single source of event names AND payload types for backend and mobile (decision B6):
 * internal domain events (EventEmitter) stay in each backend module's `events.ts`.
 *
 * Naming: `<area>:<what-happened>` in kebab-case. Each feature module declares its events in
 * its own file (`shopping-events.ts`, `fridge-events.ts` — B7); they are merged here into one
 * `REALTIME_EVENTS` map and one `RealtimeEventPayloads` type.
 */

import { FRIDGE_REALTIME_EVENTS, type FridgeRealtimeEventPayloads } from './fridge-events';
import { SHOPPING_REALTIME_EVENTS, type ShoppingRealtimeEventPayloads } from './shopping-events';

export const REALTIME_EVENTS = {
  /** Sent to the connecting socket once it is authenticated and has joined its rooms. */
  SYSTEM_READY: 'system:ready',
  /** Diagnostic broadcast (tests, admin ping) — apps may ignore it. */
  SYSTEM_PING: 'system:ping',
  /** Membership of the family changed; apps reload the member list (FR-03). */
  FAMILY_MEMBERS_CHANGED: 'family:members-changed',
  /**
   * The current user's own family changed (joined, left, removed, family dissolved).
   * Apps call POST /auth/refresh for new claims and reload family data.
   */
  USER_FAMILY_CHANGED: 'user:family-changed',
  ...SHOPPING_REALTIME_EVENTS,
  ...FRIDGE_REALTIME_EVENTS,
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export interface SystemReadyPayload {
  userId: string;
  familyId: string | null;
  /** Rooms the socket joined, e.g. ["user:…", "family:…"]. */
  rooms: string[];
}

export interface SystemPingPayload {
  message: string;
  /** ISO timestamp. */
  sentAt: string;
}

export type FamilyMembershipChange =
  'created' | 'joined' | 'left' | 'removed' | 'ownership-transferred';

export interface FamilyMembersChangedPayload {
  familyId: string;
  change: FamilyMembershipChange;
  /** The user the change is about. */
  userId: string;
}

export interface UserFamilyChangedPayload {
  /** New family id, or null when the user no longer belongs to a family. */
  familyId: string | null;
  reason: 'created' | 'joined' | 'left' | 'removed' | 'dissolved';
}

/** Event name → payload type map, used to type `emitToFamily` / `socket.on`. */
export interface RealtimeEventPayloads
  extends ShoppingRealtimeEventPayloads, FridgeRealtimeEventPayloads {
  [REALTIME_EVENTS.SYSTEM_READY]: SystemReadyPayload;
  [REALTIME_EVENTS.SYSTEM_PING]: SystemPingPayload;
  [REALTIME_EVENTS.FAMILY_MEMBERS_CHANGED]: FamilyMembersChangedPayload;
  [REALTIME_EVENTS.USER_FAMILY_CHANGED]: UserFamilyChangedPayload;
}

/**
 * Error codes carried by `connect_error` (`err.message`) when the handshake is rejected.
 * Same strings as the REST ErrorCode values.
 */
export const REALTIME_CONNECT_ERRORS = {
  TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
} as const;
