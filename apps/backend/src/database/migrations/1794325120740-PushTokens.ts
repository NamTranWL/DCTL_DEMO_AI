import { MigrationInterface, QueryRunner } from 'typeorm';

export class PushTokens1794325120740 implements MigrationInterface {
  name = 'PushTokens1794325120740';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."push_tokens_platform_enum" AS ENUM('IOS', 'ANDROID')`,
    );
    await queryRunner.query(
      `CREATE TABLE "push_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "token" character varying(255) NOT NULL, "platform" "public"."push_tokens_platform_enum" NOT NULL, CONSTRAINT "uq_push_tokens_token" UNIQUE ("token"), CONSTRAINT "pk_push_tokens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_push_tokens_user_id" ON "push_tokens" ("user_id") `);
    await queryRunner.query(
      `ALTER TABLE "push_tokens" ADD CONSTRAINT "fk_push_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "push_tokens" DROP CONSTRAINT "fk_push_tokens_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_push_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "push_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."push_tokens_platform_enum"`);
  }
}
