import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function databaseCredentials() {
  const { DB_HOST, DB_PORT = "5432", DB_USER, DB_PASSWORD, DB_NAME } =
    process.env;

  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME)
    throw new Error(
      "Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME before running a db:* command.",
    );

  return {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };
}

export default defineConfig({
  dialect: "postgresql",
  casing: "snake_case",
  schema: "./src/drizzle/migration-schema.ts",
  out: "./drizzle",
  dbCredentials: databaseCredentials(),
  strict: true,
  verbose: true,
});
