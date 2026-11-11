import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * B4 — authentication & family invitations (schema additions beyond PROJECT_CONTEXT.md §11):
 * - refresh_tokens: hashed refresh tokens with rotation / revocation;
 * - families.invite_code: 8-char join code, unique.
 * Hand-edited: invite_code is back-filled for existing families before NOT NULL is applied,
 * so the migration also works on a database that already contains data.
 */
export class AuthRefreshTokensInviteCode1794302075275 implements MigrationInterface {
  name = 'AuthRefreshTokensInviteCode1794302075275';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE ("token_hash"), CONSTRAINT "pk_refresh_tokens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "families" ADD "invite_code" character varying(8)`);
    // Back-fill: 8 upper-case hex chars, unique per row (md5 of random + id).
    await queryRunner.query(
      `UPDATE "families" SET "invite_code" = upper(substr(md5(random()::text || "id"::text), 1, 8)) WHERE "invite_code" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "families" ALTER COLUMN "invite_code" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "families" ADD CONSTRAINT "uq_families_invite_code" UNIQUE ("invite_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "families" DROP CONSTRAINT "uq_families_invite_code"`);
    await queryRunner.query(`ALTER TABLE "families" DROP COLUMN "invite_code"`);
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
