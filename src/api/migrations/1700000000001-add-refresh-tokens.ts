export class AddRefreshTokens1700000000001 {
  name = "AddRefreshTokens1700000000001";

  async up(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    const userTableRef = getUserTableReference();

    await queryRunner.query(`
      CREATE TABLE "refresh_token" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuidv7(),
        "token_hash" varchar NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "userId" uuid,
        "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        CONSTRAINT "FK_refresh_token_user" FOREIGN KEY ("userId") REFERENCES ${userTableRef} ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_token_user" ON "refresh_token" ("userId")`,
    );
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_refresh_token_user"`);
    await queryRunner.query(`DROP TABLE "refresh_token"`);
  }
}

const getUserTableReference = () => {
  const table = getSafeIdentifier(process.env.USER_TABLE, "app_user");
  const schema = process.env.USER_TABLE_SCHEMA
    ? getSafeIdentifier(process.env.USER_TABLE_SCHEMA, "")
    : "";
  return schema ? `"${schema}"."${table}"` : `"${table}"`;
};

const getSafeIdentifier = (value: string | undefined, fallback: string) => {
  const resolved = value?.trim() || fallback;
  if (!resolved || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(resolved)) {
    throw new Error(`Invalid SQL identifier: ${resolved}`);
  }
  return resolved;
};
