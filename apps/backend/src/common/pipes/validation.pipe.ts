import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';

/** One invalid field in a VALIDATION_ERROR response (`details` is an array of these). */
export interface FieldError {
  field: string;
  /** Constraint name → message (DTOs should declare Vietnamese messages). */
  constraints: Record<string, string>;
}

/** Flatten nested class-validator errors into dotted field paths (e.g. `items.0.quantity`). */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldError[] = error.constraints
      ? [{ field, constraints: { ...error.constraints } }]
      : [];
    const children = error.children?.length ? flattenValidationErrors(error.children, field) : [];
    return [...own, ...children];
  });
}

/**
 * Global ValidationPipe: strips unknown properties (whitelist), rejects them
 * (forbidNonWhitelisted) and converts payloads to DTO instances (transform).
 * Rejecting unknown keys also prevents clients from sending `familyId` (BR-06).
 * @br BR-06
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => AppException.validation(flattenValidationErrors(errors)),
  });
}
