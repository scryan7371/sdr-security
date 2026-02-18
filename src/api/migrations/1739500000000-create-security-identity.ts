export class CreateSecurityIdentity1739500000000 {
  name = "CreateSecurityIdentity1739500000000";

  async up(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    const userTableRef = getUserTableReference();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_identity" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
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

const getUserTableReference = () => {
  const table = getSafeIdentifier(process.env.USER_TABLE, "app_user");
  const schema = process.env.USER_TABLE_SCHEMA
    ? getSafeIdentifier(process.env.USER_TABLE_SCHEMA, "public")
    : "public";
  return `"${schema}"."${table}"`;
};
