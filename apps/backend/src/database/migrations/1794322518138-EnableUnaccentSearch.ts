import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * B5 — accent-insensitive food/recipe search uses `lower(unaccent(name))` (BR-04, FR-12).
 * docker/postgres/init already enables the extension for new local volumes; this migration makes
 * every other database (older volumes, CI, hosted Postgres) consistent. Needs a role allowed to
 * create extensions (the docker-compose user is a superuser).
 */
export class EnableUnaccentSearch1794322518138 implements MigrationInterface {
  name = 'EnableUnaccentSearch1794322518138';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
  }

  public async down(): Promise<void> {
    // Intentionally a no-op: other objects may rely on the extension.
  }
}
