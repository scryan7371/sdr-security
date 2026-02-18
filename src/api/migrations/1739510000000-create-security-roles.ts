export class CreateSecurityRoles1739510000000 {
  name = "CreateSecurityRoles1739510000000";

  async up(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_role" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuidv7(),
        "role_key" varchar NOT NULL,
        "description" text,
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_security_role_id_uuidv7" CHECK ("id"::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_role_key" ON "security_role" ("role_key")`,
    );

    await queryRunner.query(`
      INSERT INTO "security_role" ("role_key", "description", "is_system", "created_at", "updated_at")
      VALUES ('ADMIN', 'Administrative access', true, now(), now())
      ON CONFLICT ("role_key") DO NOTHING
    `);
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_security_role_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_role"`);
  }
}
