import { DefaultNamingStrategy, type NamingStrategyInterface, type Table } from 'typeorm';

/** camelCase → snake_case (e.g. `familyId` → `family_id`, `createdAt` → `created_at`). */
export function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Maps entity property names to the snake_case column names of PROJECT_CONTEXT.md §11,
 * so entities use camelCase (`expiryDate`) while tables keep `expiry_date`.
 * Explicit `name` options on @Entity/@Column/@JoinColumn always win.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ?? toSnakeCase(targetName);
  }

  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const prefix = embeddedPrefixes.map(toSnakeCase).join('_');
    const name = customName ?? toSnakeCase(propertyName);
    return prefix ? `${prefix}_${name}` : name;
  }

  /** Readable primary key names: `pk_<table>` instead of a hash (PK_043c…). */
  override primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    const table = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    const tableName = table.includes('.') ? table.slice(table.lastIndexOf('.') + 1) : table;
    return columnNames.length > 0 ? `pk_${tableName}` : super.primaryKeyName(tableOrName, []);
  }

  override relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  override joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return toSnakeCase(
      `${firstTableName}_${firstPropertyName.replace(/\./g, '_')}_${secondTableName}`,
    );
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return toSnakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
