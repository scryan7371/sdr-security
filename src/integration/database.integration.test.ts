import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, ClientConfig } from "pg";
import { securityMigrations } from "../api/migrations";

type QueryRunnerLike = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

const loadEnvFile = (filepath: string) => {
  if (!existsSync(filepath)) {
    return;
  }

  const file = readFileSync(filepath, "utf8");
  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }

    const rawKey = trimmed.slice(0, index).trim();
    const key = rawKey.startsWith("export ")
      ? rawKey.slice("export ".length).trim()
      : rawKey;
    const rawValue = trimmed.slice(index + 1).trim();
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    if (!process.env[key]) {
      process.env[key] = unquoted;
    }
  }
};

const loadDotEnvDefaults = () => {
  const cwd = process.cwd();
  const fileDir = __dirname;
  const projectRoot = path.resolve(fileDir, "../..");

  const candidates = [
    path.join(cwd, ".env.test"),
    path.join(cwd, ".env.dev"),
    path.join(projectRoot, ".env.test"),
    path.join(projectRoot, ".env.dev"),
  ];

  for (const candidate of candidates) {
    loadEnvFile(candidate);
  }
};

const resolveDbConfig = (): ClientConfig | null => {
  const connectionString =
    process.env.SECURITY_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (connectionString) {
    return { connectionString };
  }

  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    return null;
  }

  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
};

loadDotEnvDefaults();
const dbConfig = resolveDbConfig();
const missingRequiredDbVars = ["DB_HOST", "DB_USER", "DB_NAME"].filter(
  (key) => !process.env[key],
);
const keepSchemaForDebug = process.env.SECURITY_TEST_KEEP_SCHEMA === "true";
const fixedSchemaName = process.env.SECURITY_TEST_SCHEMA?.trim() || "";
const resetSchemaBeforeRun = process.env.SECURITY_TEST_RESET_SCHEMA !== "false";

describe("database integration", () => {
  const previousUserTable = process.env.USER_TABLE;
  const previousUserSchema = process.env.USER_TABLE_SCHEMA;

  const schema = fixedSchemaName || `sdr_security_it_${Date.now()}`;
  let client: Client;
  let runner: QueryRunnerLike;

  beforeAll(async () => {
    if (!dbConfig) {
      throw new Error(
        `Database integration tests require DB env. Missing: ${missingRequiredDbVars.join(", ") || "unknown"}`,
      );
    }

    client = new Client(dbConfig as ClientConfig);
    await client.connect();

    runner = {
      query: async (sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params as any[] | undefined);
        return result.rows;
      },
    };

    if (resetSchemaBeforeRun) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."app_user" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" varchar NOT NULL
      )
    `);

    process.env.USER_TABLE = "app_user";
    process.env.USER_TABLE_SCHEMA = schema;

    for (const Migration of securityMigrations) {
      await new Migration().up(runner as never);
    }
  });

  afterAll(async () => {
    if (!client) {
      return;
    }

    if (!keepSchemaForDebug) {
      for (const Migration of [...securityMigrations].reverse()) {
        await new Migration().down(runner as never);
      }
      await client.query(`DROP TABLE IF EXISTS "${schema}"."app_user"`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await client.end();

    process.env.USER_TABLE = previousUserTable;
    process.env.USER_TABLE_SCHEMA = previousUserSchema;
  });

  it("creates expected security tables and indexes", async () => {
    const tables = await client.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2)
    `,
      [
        schema,
        [
          "refresh_token",
          "security_identity",
          "security_role",
          "security_user_role",
          "security_password_reset_token",
        ],
      ],
    );

    expect(tables.rows).toHaveLength(5);

    const adminRole = await client.query(
      `SELECT role_key FROM "${schema}"."security_role" WHERE role_key = 'ADMIN' LIMIT 1`,
    );
    expect(adminRole.rows).toHaveLength(1);

    const index = await client.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = $1
        AND indexname = 'IDX_security_user_role_user_role'
      `,
      [schema],
    );

    expect(index.rows).toHaveLength(1);
  });

  it("prints schema name for debugging", () => {
    console.log(`[sdr-security test:db] schema=${schema}`);
    console.log(
      `[sdr-security test:db] keepSchema=${keepSchemaForDebug ? "true" : "false"}`,
    );
    console.log(
      `[sdr-security test:db] resetSchemaBeforeRun=${resetSchemaBeforeRun ? "true" : "false"}`,
    );
    expect(schema.length).toBeGreaterThan(0);
  });
});
