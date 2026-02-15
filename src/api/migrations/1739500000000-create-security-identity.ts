export class CreateSecurityIdentity1739500000000 {
  name = "CreateSecurityIdentity1739500000000";

  async up(queryRunner: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
  }): Promise<void> {
    const userTable = getSafeIdentifier(process.env.USER_TABLE, "app_user");
    const userSchema = getSafeIdentifier(
      process.env.USER_TABLE_SCHEMA,
      "public",
    );
    const userTableRef = `"${userSchema}"."${userTable}"`;

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_identity" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" varchar NOT NULL,
        "provider" varchar NOT NULL,
        "provider_subject" varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_security_identity_user_id" FOREIGN KEY ("user_id") REFERENCES ${userTableRef} ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_identity_provider_subject" ON "security_identity" ("provider", "provider_subject")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_identity_user_provider" ON "security_identity" ("user_id", "provider")`,
    );

    const hasGoogleSubjectColumn = (await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = 'google_subject'
        LIMIT 1
      `,
      [userSchema, userTable],
    )) as Array<{ "?column?": number }>;

    if (hasGoogleSubjectColumn.length > 0) {
      await queryRunner.query(`
        INSERT INTO "security_identity" (
          "user_id",
          "provider",
          "provider_subject",
          "created_at",
          "updated_at"
        )
        SELECT
          "id",
          'google',
          "google_subject",
          now(),
          now()
        FROM ${userTableRef}
        WHERE "google_subject" IS NOT NULL
        ON CONFLICT ("provider", "provider_subject") DO NOTHING
      `);

      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_app_user_google_subject"`,
      );
      await queryRunner.query(
        `ALTER TABLE ${userTableRef} DROP COLUMN IF EXISTS "google_subject"`,
      );
    }
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_security_identity_user_provider"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_security_identity_provider_subject"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "security_identity"`);
  }
}

const getSafeIdentifier = (value: string | undefined, fallback: string) => {
  const resolved = value?.trim() || fallback;
  if (!resolved || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(resolved)) {
    throw new Error(`Invalid SQL identifier: ${resolved}`);
  }
  return resolved;
};
