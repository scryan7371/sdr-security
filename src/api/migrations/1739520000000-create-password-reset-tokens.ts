export class CreatePasswordResetTokens1739520000000 {
  name = "CreatePasswordResetTokens1739520000000";

  async up(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    const userTableRef = getUserTableReference();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_password_reset_token" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" varchar NOT NULL,
        "token" varchar NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_security_password_reset_token_user_id" FOREIGN KEY ("user_id") REFERENCES ${userTableRef} ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_password_reset_token_token" ON "security_password_reset_token" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_password_reset_token_user_id" ON "security_password_reset_token" ("user_id")`,
    );
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_security_password_reset_token_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_security_password_reset_token_token"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "security_password_reset_token"`,
    );
  }
}

const getUserTableReference = () => {
  const table = getSafeIdentifier(process.env.USER_TABLE, "app_user");
  const schema = process.env.USER_TABLE_SCHEMA
    ? getSafeIdentifier(process.env.USER_TABLE_SCHEMA, "public")
    : "public";
  return `"${schema}"."${table}"`;
};

const getSafeIdentifier = (value: string | undefined, fallback: string) => {
  const resolved = value?.trim() || fallback;
  if (!resolved || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(resolved)) {
    throw new Error(`Invalid SQL identifier: ${resolved}`);
  }
  return resolved;
};
