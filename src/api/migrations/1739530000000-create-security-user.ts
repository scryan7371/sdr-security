export class CreateSecurityUser1739530000000 {
  name = "CreateSecurityUser1739530000000";

  async up(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    const userTableRef = getUserTableReference();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_user" (
        "user_id" uuid PRIMARY KEY NOT NULL,
        "password_hash" varchar NOT NULL,
        "email_verified_at" timestamptz,
        "email_verification_token" varchar,
        "admin_approved_at" timestamptz,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_security_user_user_id" FOREIGN KEY ("user_id") REFERENCES ${userTableRef} ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_user_email_verification_token" ON "security_user" ("email_verification_token") WHERE "email_verification_token" IS NOT NULL`,
    );
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_security_user_email_verification_token"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "security_user"`);
  }
}

const getSafeIdentifier = (value: string | undefined, fallback: string) => {
  const resolved = value?.trim() || fallback;
  if (!resolved || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(resolved)) {
    throw new Error(`Invalid SQL identifier: ${resolved}`);
  }
  return resolved;
};

const getUserTableReference = () => {
  const table = getSafeIdentifier(process.env.USER_TABLE, "app_user");
  const schema = process.env.USER_TABLE_SCHEMA
    ? getSafeIdentifier(process.env.USER_TABLE_SCHEMA, "public")
    : "public";
  return `"${schema}"."${table}"`;
};
