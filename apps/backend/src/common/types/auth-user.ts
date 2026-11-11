import { type UserRole, type UserStatus } from '@dctl/shared';
import { type Request } from 'express';

/**
 * The authenticated user attached to `request.user` by JwtAuthGuard.
 * Loaded from the database on every request (not only decoded from the token), so a
 * member removed from a family or a locked account loses access immediately (BR-06).
 */
export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  /** Current family from the database; null when the user has none (BR-11). */
  familyId: string | null;
}

/** Claims carried by the access token (JWT payload). */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  role: UserRole;
  familyId: string | null;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
