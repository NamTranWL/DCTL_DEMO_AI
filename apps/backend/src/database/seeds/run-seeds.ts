/**
 * Seed runner: `pnpm seed` (from the repo root or apps/backend).
 * Runs every seeder from SEEDERS in order, all inside ONE transaction: either the
 * whole seed succeeds or nothing is written. Safe to run repeatedly (idempotent).
 * Refuses to run when NODE_ENV=production (demo accounts have known passwords).
 */
import { Logger } from '@nestjs/common';
import { todayIn } from '../../common/utils/date.util';
import { validateEnv } from '../../config/env.validation';
import AppDataSource from '../data-source';
import { SEEDERS } from './index';
import { type SeedContext } from './seeder.interface';

const logger = new Logger('Seed');

async function runSeeds(): Promise<void> {
  const env = validateEnv(process.env);
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }
  const context: SeedContext = { today: todayIn(env.APP_TIMEZONE) };

  await AppDataSource.initialize();
  try {
    logger.log(`Seeding ${SEEDERS.length} seeder(s), today = ${context.today}`);
    await AppDataSource.transaction(async (manager) => {
      for (const seeder of SEEDERS) {
        const startedAt = Date.now();
        await seeder.run(manager, context);
        logger.log(`✓ ${seeder.name} (${Date.now() - startedAt} ms)`);
      }
    });
    logger.log('Seed completed.');
  } finally {
    await AppDataSource.destroy();
  }
}

runSeeds().catch((error: unknown) => {
  logger.error('Seeding failed', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
