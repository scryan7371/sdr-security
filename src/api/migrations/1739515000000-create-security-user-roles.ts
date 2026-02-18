export class CreateSecurityUserRoles1739515000000 {
  name = "CreateSecurityUserRoles1739515000000";

  async up(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    const userTableRef = getUserTableReference();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_user_role" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_security_user_role_user_id" FOREIGN KEY ("user_id") REFERENCES ${userTableRef} ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_security_user_role_role_id" FOREIGN KEY ("role_id") REFERENCES "security_role" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_security_user_role_user_role" ON "security_user_role" ("user_id", "role_id")`,
    );
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_security_user_role_user_role"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "security_user_role"`);
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
