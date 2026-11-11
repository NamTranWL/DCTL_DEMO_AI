import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { isRecord } from '../utils/http-error.util';

/** Response header carrying the server-side processing time in milliseconds. */
export const RESPONSE_TIME_HEADER = 'X-Response-Time';

/** Requests slower than this are logged as warnings (NFR §9: normal operations < 1 s). */
export const SLOW_REQUEST_THRESHOLD_MS = 1000;

/** One structured record per HTTP request; the admin monitoring module (FR-27) consumes these. */
export interface RequestLogRecord {
  method: string;
  route: string;
  url: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
}

/**
 * Logs method, route, status and processing time of every HTTP request and sets
 * the X-Response-Time header. Feeds response-time and error-rate monitoring.
 * @uc UC-ADM-04  @fr FR-27
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { sub?: string } }>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    const finish = (statusCode: number): void => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      if (!response.headersSent) {
        response.setHeader(RESPONSE_TIME_HEADER, `${durationMs.toFixed(1)}ms`);
      }
      this.write({
        method: request.method,
        route: this.routePattern(request),
        url: request.originalUrl,
        statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: request.user?.sub,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => finish(response.statusCode),
        error: (error: unknown) => finish(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }

  private routePattern(request: Request): string {
    // Express types `request.route` as any; narrow it before use.
    const route: unknown = (request as { route?: unknown }).route;
    const path = isRecord(route) ? route.path : undefined;
    return typeof path === 'string' ? `${request.baseUrl}${path}` : request.path;
  }

  private write(record: RequestLogRecord): void {
    const line = `${record.method} ${record.url} ${record.statusCode} ${record.durationMs}ms`;
    const payload = JSON.stringify(record);
    if (record.statusCode >= 500) {
      this.logger.error(`${line} ${payload}`);
    } else if (record.durationMs > SLOW_REQUEST_THRESHOLD_MS) {
      this.logger.warn(`[slow] ${line} ${payload}`);
    } else {
      this.logger.log(line);
    }
  }
}
