import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../exceptions/error-code.enum';

const STATUS_TO_CODE: Readonly<Record<number, ErrorCode | undefined>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BadRequest,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthorized,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.MethodNotAllowed,
  [HttpStatus.CONFLICT]: ErrorCode.Conflict,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PayloadTooLarge,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UnprocessableEntity,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TooManyRequests,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.ServiceUnavailable,
  [HttpStatus.GATEWAY_TIMEOUT]: ErrorCode.GatewayTimeout,
};

/** Map an HTTP status to the generic error code (fallback by status class). */
export function errorCodeFromStatus(status: number): ErrorCode {
  const mapped = STATUS_TO_CODE[status];
  if (mapped) {
    return mapped;
  }
  return status >= 500 ? ErrorCode.InternalError : ErrorCode.BadRequest;
}

/** PostgreSQL SQLSTATE codes the API translates into user-facing errors. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
