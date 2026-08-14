import path from "node:path";
import {NodePgDatabase} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";

export const securityMigrationsFolder = path.resolve(
    __dirname,
    "../../drizzle",
);

export const migrateSecurityDatabase = async <
    TSchema extends Record<string, unknown>,
>(db: NodePgDatabase<TSchema>): Promise<void> => {
    await migrate(db, {
        migrationsFolder: securityMigrationsFolder,
        migrationsTable: "__sdr_security_migrations",
    });
};
