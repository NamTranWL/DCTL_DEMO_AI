import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';
import { ErrorCode } from './error-code.enum';

/**
 * Thrown by entity state-transition methods (markAsPurchased, complete, approve…)
 * when the requested transition is not in the state machine.
 */
export class InvalidStateTransitionException extends AppException {
  constructor(entity: string, from: string, to: string, message?: string) {
    super(ErrorCode.InvalidStateTransition, message, HttpStatus.CONFLICT, { entity, from, to });
  }
}

/** Thrown when a quantity is not positive or would make stock negative (BR-03). */
export class InvalidQuantityException extends AppException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.InvalidQuantity, message, HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * Thrown when a fridge lot (or all usable lots of a food, FEFO) holds less than requested;
 * stock never becomes negative (BR-03).
 */
export class InsufficientStockException extends AppException {
  constructor(details?: unknown, message?: string) {
    super(ErrorCode.InsufficientStock, message, HttpStatus.CONFLICT, details);
  }
}

/**
 * Throws InvalidStateTransitionException unless `to` is reachable from `from`
 * in the given transition table.
 */
export function assertTransition<S extends string>(
  entity: string,
  transitions: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
  message?: string,
): void {
  if (!transitions[from].includes(to)) {
    throw new InvalidStateTransitionException(entity, from, to, message);
  }
}
