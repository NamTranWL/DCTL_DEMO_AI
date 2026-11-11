import { type AuthUser } from '../../common/types/auth-user';

/**
 * Port used by the realtime gateway to authenticate a Socket.IO handshake.
 * Implemented by the auth module (AccessTokenAuthenticator) and wired in AppModule, so this
 * infrastructure layer never imports a feature module.
 * Must throw an AppException (code AUTH_*) when the token is missing/invalid/expired or the
 * account is locked.
 */
export interface RealtimeAuthenticator {
  authenticate(token: string | null): Promise<AuthUser>;
}

export const REALTIME_AUTHENTICATOR = Symbol('REALTIME_AUTHENTICATOR');
