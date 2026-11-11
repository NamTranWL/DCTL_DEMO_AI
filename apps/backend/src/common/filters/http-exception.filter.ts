import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Response } from 'express';
import { OptimisticLockVersionMismatchError, QueryFailedError } from 'typeorm';
import { type ErrorBody } from '../exceptions/app.exception';
import { DEFAULT_ERROR_MESSAGES, ErrorCode } from '../exceptions/error-code.enum';
import { errorCodeFromStatus, isRecord, PG_ERROR } from '../utils/http-error.util';

/** First HTTP status of the 5xx class. */
const SERVER_ERROR_MIN_STATUS = 500;

interface NormalizedError {
  status: number;
  body: ErrorBody;
}

/**
 * Global exception filter: every error leaves the API as `{ code, message, details }`
 * with a Vietnamese `message`. Unknown errors become INTERNAL_ERROR and are logged
 * with their stack; internals are never leaked to the client.
 * @fr FR-27
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      // WebSocket errors are handled by the gateway's own filter (B6).
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { status, body } = this.normalize(exception);

    if (status >= SERVER_ERROR_MIN_STATUS) {
      if (exception instanceof HttpException) {
        // Deliberate 5xx (e.g. health 503): no stack trace needed.
        this.logger.warn(`${status} ${body.code}: ${body.message}`);
      } else {
        const stack = exception instanceof Error ? exception.stack : String(exception);
        this.logger.error(`${body.code}: ${body.message}`, stack);
      }
    }

    response.status(status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof OptimisticLockVersionMismatchError) {
      return this.build(HttpStatus.CONFLICT, ErrorCode.VersionConflict);
    }
    if (exception instanceof QueryFailedError) {
      return this.fromQueryFailed(exception);
    }
    return this.build(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.InternalError);
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const response = exception.getResponse();

    // Already in our format (AppException or code-aware throw).
    if (isRecord(response) && typeof response.code === 'string') {
      const message =
        typeof response.message === 'string'
          ? response.message
          : DEFAULT_ERROR_MESSAGES[response.code as ErrorCode];
      return {
        status,
        body: { code: response.code, message, details: response.details },
      };
    }

    // Built-in Nest exceptions (NotFoundException, Terminus 503, ...): keep their payload
    // as details, but always answer with a Vietnamese message for the generic code.
    const code = errorCodeFromStatus(status);
    const details = isRecord(response) ? this.stripNestEnvelope(response) : undefined;
    return this.build(status, code, details);
  }

  private fromQueryFailed(exception: { driverError: unknown }): NormalizedError {
    const { driverError } = exception;
    const sqlState = isRecord(driverError) ? driverError.code : undefined;
    const constraint = isRecord(driverError) ? driverError.constraint : undefined;
    const details = typeof constraint === 'string' ? { constraint } : undefined;

    if (sqlState === PG_ERROR.UNIQUE_VIOLATION) {
      return this.build(HttpStatus.CONFLICT, ErrorCode.UniqueViolation, details);
    }
    if (sqlState === PG_ERROR.FOREIGN_KEY_VIOLATION) {
      return this.build(HttpStatus.CONFLICT, ErrorCode.ForeignKeyViolation, details);
    }
    return this.build(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.InternalError);
  }

  /**
   * Nest built-ins answer `{ statusCode, message, error }`; those keys duplicate our envelope.
   * Keep only the useful extras (e.g. validation message list). Other payloads (Terminus
   * health result, custom objects) are passed through unchanged as `details`.
   */
  private stripNestEnvelope(response: Record<string, unknown>): unknown {
    if (!('statusCode' in response)) {
      return response;
    }
    const { statusCode: _statusCode, error: _error, message, ...rest } = response;
    if (Object.keys(rest).length > 0) {
      return rest;
    }
    return Array.isArray(message) ? message : undefined;
  }

  private build(status: number, code: ErrorCode, details?: unknown): NormalizedError {
    return { status, body: { code, message: DEFAULT_ERROR_MESSAGES[code], details } };
  }
}
