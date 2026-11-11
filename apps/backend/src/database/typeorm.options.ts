import { join } from 'node:path';
import { type DataSourceOptions } from 'typeorm';
import { type Env } from '../config/env.validation';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/** Name of the table TypeORM uses to record applied migrations. */
export const MIGRATIONS_TABLE = 'typeorm_migrations';

/** Environment keys needed to build the TypeORM connection. */
export type DatabaseEnv = Pick<
  Env,
  'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_NAME' | 'DB_LOGGING' | 'APP_TIMEZONE'
>;

/**
 * Single builder for TypeORM options, shared by the Nest app (DatabaseModule)
 * and the CLI (data-source.ts) so both always point at the same entities/migrations.
 * Globs match `.ts` when run through ts-node/ts-jest and `.js` from `dist/`.
 */
export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  const srcRoot = join(__dirname, '..');
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [join(srcRoot, 'modules', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: MIGRATIONS_TABLE,
    namingStrategy: new SnakeNamingStrategy(),
    // gen_random_uuid() from pgcrypto (enabled by docker/postgres/init) instead of uuid-ossp.
    uuidExtension: 'pgcrypto',
    // Schema changes go through migrations only (never auto-sync).
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING ? ['query', 'error', 'migration'] : ['error', 'migration'],
    // Session timezone for timestamptz rendering; business dates use APP_TIMEZONE (BR-01).
    extra: { options: `-c timezone=${env.APP_TIMEZONE}` },
  };
}
