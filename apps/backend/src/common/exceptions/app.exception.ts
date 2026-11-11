import { HttpException, HttpStatus } from '@nestjs/common';
import { DEFAULT_ERROR_MESSAGES, ErrorCode } from './error-code.enum';

/** Body carried by every AppException; serialized as-is by HttpExceptionFilter. */
export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Business exception with a stable error code and a Vietnamese user message.
 * Services throw this (or a subclass) instead of raw HttpException so the
 * client always receives `{ code, message, details }`.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode | string,
    message?: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    const resolvedMessage =
      message ??
      DEFAULT_ERROR_MESSAGES[code as ErrorCode] ??
      DEFAULT_ERROR_MESSAGES[ErrorCode.BadRequest];
    const body: ErrorBody = { code, message: resolvedMessage, details };
    super(body, status);
  }

  static notFound(message?: string, details?: unknown): AppException {
    return new AppException(ErrorCode.NotFound, message, HttpStatus.NOT_FOUND, details);
  }

  static forbidden(message?: string, details?: unknown): AppException {
    return new AppException(ErrorCode.Forbidden, message, HttpStatus.FORBIDDEN, details);
  }

  static conflict(message?: string, details?: unknown): AppException {
    return new AppException(ErrorCode.Conflict, message, HttpStatus.CONFLICT, details);
  }

  static validation(details: unknown, message?: string): AppException {
    return new AppException(ErrorCode.ValidationError, message, HttpStatus.BAD_REQUEST, details);
  }
}
