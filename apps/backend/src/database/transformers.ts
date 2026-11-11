import { type ColumnOptions, type ValueTransformer } from 'typeorm';

/**
 * pg returns `numeric` columns as strings to avoid precision loss.
 * Quantities in this app fit comfortably in a JS number, so convert both ways.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

/** numeric(12,3) quantity column: up to 999 999 999.999 (kg, g, l, ml, quả…). */
export const quantityColumn = (options: ColumnOptions = {}): ColumnOptions => ({
  type: 'numeric',
  precision: 12,
  scale: 3,
  transformer: numericTransformer,
  ...options,
});

/** numeric(12,2) money column in VND. */
export const moneyColumn = (options: ColumnOptions = {}): ColumnOptions => ({
  type: 'numeric',
  precision: 12,
  scale: 2,
  transformer: numericTransformer,
  ...options,
});
