import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';

/** Success envelope for every REST response: `{ data }` (plus `meta` for paged lists). */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Handlers may return this to attach `meta` (e.g. pagination) next to `data`. */
export class Paged<T> {
  constructor(
    readonly items: T[],
    readonly meta: { total: number; page: number; pageSize: number },
  ) {}
}

/**
 * Wraps successful HTTP responses as `{ data }` so the mobile client parses one shape.
 * Errors are shaped separately by HttpExceptionFilter.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<unknown> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<unknown> | T> {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_TRANSFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (context.getType() !== 'http' || skip === true) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body): ApiResponse<unknown> => {
        if (body instanceof Paged) {
          return { data: body.items, meta: { ...body.meta } };
        }
        return { data: body ?? null };
      }),
    );
  }
}
