import { ParseUUIDPipe } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';

/**
 * `@Param('id', uuidParam('id'))` — validates a path parameter as a UUID (any version)
 * and answers with the standard VALIDATION_ERROR in Vietnamese.
 */
export function uuidParam(field: string, message = 'Mã không hợp lệ.'): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => AppException.validation([{ field, constraints: { isUuid: message } }]),
  });
}
