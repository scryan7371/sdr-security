export class CreateSecurityRoles1739510000000 {
  name = "CreateSecurityRoles1739510000000";

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
      CREATE TABLE IF NOT EXISTS "security_role" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
        "role_key" varchar NOT NULL,
        "description" text,
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_role_key" ON "security_role" ("role_key")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_user_role" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" varchar NOT NULL,
        "role_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_security_user_role_user_id" FOREIGN KEY ("user_id") REFERENCES ${userTableRef} ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_security_user_role_role_id" FOREIGN KEY ("role_id") REFERENCES "security_role" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_user_role_user_role" ON "security_user_role" ("user_id", "role_id")`,
    );

    await queryRunner.query(`
      INSERT INTO "security_role" ("role_key", "description", "is_system", "created_at", "updated_at")
      VALUES ('ADMIN', 'Administrative access', true, now(), now())
      ON CONFLICT ("role_key") DO NOTHING
    `);

    const hasRoleColumn = (await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = 'role'
        LIMIT 1
      `,
      [userSchema, userTable],
    )) as Array<{ "?column?": number }>;

    if (hasRoleColumn.length > 0) {
      await queryRunner.query(`
        INSERT INTO "security_role" ("role_key", "description", "is_system", "created_at", "updated_at")
        SELECT DISTINCT
          CASE
            WHEN UPPER(TRIM("role")) = 'ADMINISTRATOR' THEN 'ADMIN'
            ELSE UPPER(TRIM("role"))
          END AS "role_key",
          NULL,
          false,
          now(),
          now()
        FROM ${userTableRef}
        WHERE "role" IS NOT NULL
          AND LENGTH(TRIM("role")) > 0
        ON CONFLICT ("role_key") DO NOTHING
      `);

      await queryRunner.query(`
        INSERT INTO "security_user_role" ("user_id", "role_id", "created_at")
        SELECT
          u."id" AS "user_id",
          r."id" AS "role_id",
          now()
        FROM ${userTableRef} u
        INNER JOIN "security_role" r ON r."role_key" = CASE
          WHEN UPPER(TRIM(u."role")) = 'ADMINISTRATOR' THEN 'ADMIN'
          ELSE UPPER(TRIM(u."role"))
        END
        WHERE u."role" IS NOT NULL
          AND LENGTH(TRIM(u."role")) > 0
        ON CONFLICT ("user_id", "role_id") DO NOTHING
      `);

      await queryRunner.query(
        `ALTER TABLE ${userTableRef} DROP COLUMN IF EXISTS "role"`,
      );
    }
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_security_user_role_user_role"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "security_user_role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_security_role_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_role"`);
  }
}

const getSafeIdentifier = (value: string | undefined, fallback: string) => {
  const resolved = value?.trim() || fallback;
  if (!resolved || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(resolved)) {
    throw new Error(`Invalid SQL identifier: ${resolved}`);
  }
  return resolved;
};
