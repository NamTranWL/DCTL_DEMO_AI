import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isIsoDate } from '../utils/date.util';

/**
 * Calendar date 'YYYY-MM-DD' that really exists (2026-02-30 is rejected). Business dates are
 * stored as PostgreSQL `date` and compared as strings (date.util).
 */
export function IsIsoDate(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isIsoDate',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: { message: 'Ngày phải có dạng YYYY-MM-DD.', ...options },
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && isIsoDate(value),
      },
    });
  };
}

/** numeric(12,3) quantities: positive, at most 3 decimals (BR-03). */
export const MAX_QUANTITY = 999_999_999.999;

/** numeric(12,2) money in VND. */
export const MAX_MONEY = 9_999_999_999.99;
