import { type RealtimeEventPayloads } from '@dctl/shared';
import { type Namespace, type Socket } from 'socket.io';
import { type AuthUser } from '../../common/types/auth-user';

/** Server → client events, typed from the shared event map. */
export type ServerToClientEvents = {
  [E in keyof RealtimeEventPayloads]: (payload: RealtimeEventPayloads[E]) => void;
};

/** Client → server events (none yet: apps change data through REST, then receive broadcasts). */
export type ClientToServerEvents = Record<string, never>;

export type InterServerEvents = Record<string, never>;

/** Data attached to each socket after the handshake. */
export interface SocketData {
  user: AuthUser;
}

export type RealtimeNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
