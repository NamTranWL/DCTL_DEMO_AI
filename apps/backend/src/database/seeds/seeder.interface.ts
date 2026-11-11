import { type EntityManager } from 'typeorm';
import { type IsoDate } from '../../common/utils/date.util';

/** Values shared by every seeder in one run. */
export interface SeedContext {
  /** Today in APP_TIMEZONE — demo expiry dates are relative to it (BR-01 test data). */
  readonly today: IsoDate;
}

/**
 * A seeder inserts reference/demo data. Seeders MUST be idempotent
 * (upsert or "insert if missing") so `pnpm seed` can run any number of times.
 */
export interface Seeder {
  /** Human-readable name shown in the seed log. */
  readonly name: string;
  /** Runs inside the transaction opened by the seed runner. */
  run(manager: EntityManager, context: SeedContext): Promise<void>;
}
