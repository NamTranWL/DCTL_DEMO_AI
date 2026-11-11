import {
  type ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OptimisticLockVersionMismatchError, QueryFailedError } from 'typeorm';
import { AppException } from '../exceptions/app.exception';
import { DEFAULT_ERROR_MESSAGES, ErrorCode } from '../exceptions/error-code.enum';
import { HttpExceptionFilter } from './http-exception.filter';

interface Captured {
  status?: number;
  body?: unknown;
}

function createHost(captured: Captured, type = 'http'): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  return {
    getType: () => type,
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  function run(exception: unknown): Captured {
    const captured: Captured = {};
    filter.catch(exception, createHost(captured));
    return captured;
  }

  it('passes an AppException through unchanged', () => {
    const result = run(
      new AppException('SHOPPING_LIST_COMPLETED', 'Danh sách đã hoàn tất.', 409, { id: 'x' }),
    );

    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      code: 'SHOPPING_LIST_COMPLETED',
      message: 'Danh sách đã hoàn tất.',
      details: { id: 'x' },
    });
  });

  it('uses the Vietnamese default message when an AppException has none', () => {
    const result = run(AppException.notFound());

    expect(result.body).toEqual({
      code: ErrorCode.NotFound,
      message: DEFAULT_ERROR_MESSAGES[ErrorCode.NotFound],
      details: undefined,
    });
  });

  it('maps built-in Nest exceptions to a generic code with a Vietnamese message', () => {
    const result = run(new NotFoundException('Cannot GET /x'));

    expect(result.status).toBe(HttpStatus.NOT_FOUND);
    expect(result.body).toMatchObject({
      code: ErrorCode.NotFound,
      message: DEFAULT_ERROR_MESSAGES[ErrorCode.NotFound],
    });
  });

  it('keeps the message list of a raw BadRequestException as details', () => {
    const result = run(new BadRequestException(['a must be a string']));

    expect(result.body).toEqual({
      code: ErrorCode.BadRequest,
      message: DEFAULT_ERROR_MESSAGES[ErrorCode.BadRequest],
      details: ['a must be a string'],
    });
  });

  it('passes a custom payload (e.g. Terminus health result) through as details', () => {
    const payload = { status: 'error', error: { redis: { status: 'down' } } };
    const result = run(new ServiceUnavailableException(payload));

    expect(result.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result.body).toMatchObject({ code: ErrorCode.ServiceUnavailable, details: payload });
  });

  it('maps a PostgreSQL unique violation to 409 UNIQUE_VIOLATION', () => {
    const error = new QueryFailedError('INSERT', [], {
      code: '23505',
      constraint: 'UQ_foods_name',
    } as unknown as Error);
    const result = run(error);

    expect(result.status).toBe(HttpStatus.CONFLICT);
    expect(result.body).toMatchObject({
      code: ErrorCode.UniqueViolation,
      details: { constraint: 'UQ_foods_name' },
    });
  });

  it('maps a PostgreSQL foreign key violation to 409 FOREIGN_KEY_VIOLATION', () => {
    const error = new QueryFailedError('INSERT', [], { code: '23503' } as unknown as Error);

    expect(run(error).body).toMatchObject({ code: ErrorCode.ForeignKeyViolation });
  });

  it('maps an optimistic lock mismatch to 409 VERSION_CONFLICT', () => {
    const result = run(new OptimisticLockVersionMismatchError('ShoppingListItem', 1, 2));

    expect(result.status).toBe(HttpStatus.CONFLICT);
    expect(result.body).toMatchObject({ code: ErrorCode.VersionConflict });
  });

  it('hides unknown errors behind 500 INTERNAL_ERROR', () => {
    const result = run(new Error('db password is wrong'));

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body).toEqual({
      code: ErrorCode.InternalError,
      message: DEFAULT_ERROR_MESSAGES[ErrorCode.InternalError],
      details: undefined,
    });
  });

  it('rethrows for non-HTTP contexts (WebSocket handled elsewhere)', () => {
    const error = new Error('ws');

    expect(() => filter.catch(error, createHost({}, 'ws'))).toThrow(error);
  });
});
