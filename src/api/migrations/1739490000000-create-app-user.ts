export class CreateAppUser1739490000000 {
  name = "CreateAppUser1739490000000";

  async up(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    const userTableRef = getUserTableReference();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${userTableRef} (
        "id" uuid PRIMARY KEY NOT NULL,
        "email" varchar NOT NULL,
        "first_name" varchar,
        "last_name" varchar
      )
    `);
  }

  async down(queryRunner: {
    query: (sql: string) => Promise<unknown>;
  }): Promise<void> {
    const userTableRef = getUserTableReference();
    await queryRunner.query(`DROP TABLE IF EXISTS ${userTableRef}`);
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
