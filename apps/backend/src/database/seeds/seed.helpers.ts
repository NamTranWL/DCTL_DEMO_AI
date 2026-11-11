import { createHash } from 'node:crypto';
import { type EntityManager, type EntityTarget, In, type ObjectLiteral } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

/** Fixed namespace for seed ids (random UUID chosen once for this project). */
const SEED_NAMESPACE = '6f1d2c3e-8a4b-4c5d-9e7f-0a1b2c3d4e5f';

/**
 * Deterministic UUID v5 (RFC 4122) for seed rows: same `kind` + `key` → same id on every run,
 * so re-running the seed updates rows instead of duplicating them.
 */
export function seedId(kind: string, key: string): string {
  const namespace = Buffer.from(SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  const digest = createHash('sha1').update(namespace).update(`${kind}:${key}`, 'utf8').digest();
  const bytes = digest.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * INSERT … ON CONFLICT (conflictColumns) DO UPDATE SET updateColumns.
 * The primary key is never in `updateColumns`, so rows created earlier (or by users)
 * keep their id and foreign keys stay valid. Column names are database (snake_case) names.
 */
export async function upsertRows<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  rows: QueryDeepPartialEntity<T>[],
  conflictColumns: string[],
  updateColumns: string[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const query = manager.createQueryBuilder().insert().into(entity).values(rows);
  if (updateColumns.length > 0) {
    query.orUpdate(updateColumns, conflictColumns);
  } else {
    query.orIgnore();
  }
  await query.execute();
}

/**
 * Load rows whose `key` column is in `values` and index them by that key.
 * Throws when a value is missing — catches typos in seed data early.
 */
export async function loadByKey<T extends ObjectLiteral, K extends keyof T & string>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  key: K,
  values: readonly T[K][],
): Promise<Map<T[K], T>> {
  const unique = [...new Set(values)];
  const rows = await manager.getRepository(entity).find({
    where: { [key]: In(unique) } as never,
  });
  const map = new Map(rows.map((row) => [row[key], row] as const));
  const missing = unique.filter((value) => !map.has(value));
  if (missing.length > 0) {
    throw new Error(`Seed reference not found for ${key}: ${missing.map(String).join(', ')}`);
  }
  return map;
}

/** Map lookup that fails loudly (for references resolved by loadByKey). */
export function must<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Seed reference not found: ${String(key)}`);
  }
  return value;
}
