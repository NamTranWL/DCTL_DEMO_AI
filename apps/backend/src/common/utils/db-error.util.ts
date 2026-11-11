import { QueryFailedError } from 'typeorm';
import { isRecord, PG_ERROR } from './http-error.util';

function pgError(error: unknown): { code?: unknown; constraint?: unknown } | null {
  if (!(error instanceof QueryFailedError)) {
    return null;
  }
  const driverError: unknown = error.driverError;
  return isRecord(driverError) ? driverError : null;
}

/** Name of the violated UNIQUE constraint, or null if `error` is not a unique violation. */
export function uniqueViolationConstraint(error: unknown): string | null {
  const pg = pgError(error);
  if (pg?.code !== PG_ERROR.UNIQUE_VIOLATION) {
    return null;
  }
  return typeof pg.constraint === 'string' ? pg.constraint : '';
}

/** True when `error` is a foreign key violation (row still referenced / reference missing). */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgError(error)?.code === PG_ERROR.FOREIGN_KEY_VIOLATION;
}

/** Escape `%`, `_` and `\` for use inside a LIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
