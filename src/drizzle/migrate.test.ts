import {existsSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";

const {migrate} = vi.hoisted(() => ({
    migrate: vi.fn(async () => undefined),
}));

vi.mock("drizzle-orm/node-postgres/migrator", () => ({migrate}));

import {
    migrateSecurityDatabase,
    securityMigrationsFolder,
} from "./migrate";

describe("security migrations", () => {
    it("ships and runs migrations with an isolated journal", async () => {
        expect(existsSync(securityMigrationsFolder)).toBe(true);
        const db = {} as never;

        await migrateSecurityDatabase(db);

        expect(migrate).toHaveBeenCalledWith(db, {
            migrationsFolder: securityMigrationsFolder,
            migrationsTable: "__sdr_security_migrations",
        });
    });
});
