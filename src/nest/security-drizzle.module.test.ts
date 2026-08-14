import {Test} from "@nestjs/testing";
import {Pool} from "pg";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
    SECURITY_DRIZZLE_DB,
    SecurityDatabase,
    SecurityDrizzleModule,
} from "./security-drizzle.module";

describe("SecurityDrizzleModule", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("creates an injectable database from explicit connection options", async () => {
        const end = vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);
        const moduleRef = await Test.createTestingModule({
            imports: [
                SecurityDrizzleModule.forRoot({
                    host: "db.example.com",
                    port: 5433,
                    user: "security_user",
                    password: "secret",
                    database: "security",
                    ssl: true,
                }),
            ],
        }).compile();

        const db = moduleRef.get<SecurityDatabase & {$client: Pool}>(
            SECURITY_DRIZZLE_DB,
        );

        expect(db).toBeDefined();
        expect(db.query.user).toBeDefined();
        expect(db.query.securityRole).toBeDefined();
        expect(db.query.securityUserRole).toBeDefined();
        expect(db.$client.options).toMatchObject({
            host: "db.example.com",
            port: 5433,
            user: "security_user",
            database: "security",
            ssl: true,
        });

        await moduleRef.close();
        expect(end).toHaveBeenCalledOnce();
    });

    it("uses DB environment variables and the default PostgreSQL port", async () => {
        vi.stubEnv("DB_HOST", "localhost");
        vi.stubEnv("DB_USER", "postgres");
        vi.stubEnv("DB_PASSWORD", "postgres");
        vi.stubEnv("DB_NAME", "security_test");
        vi.stubEnv("DB_PORT", "");
        vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);

        const moduleRef = await Test.createTestingModule({
            imports: [SecurityDrizzleModule.forRoot()],
        }).compile();
        const db = moduleRef.get<SecurityDatabase & {$client: Pool}>(
            SECURITY_DRIZZLE_DB,
        );

        expect(db.$client.options).toMatchObject({
            host: "localhost",
            port: 5432,
            user: "postgres",
            database: "security_test",
        });

        await moduleRef.close();
    });

    it("rejects startup when required connection settings are missing", async () => {
        vi.stubEnv("DB_HOST", "");
        vi.stubEnv("DB_USER", "");
        vi.stubEnv("DB_PASSWORD", "");
        vi.stubEnv("DB_NAME", "");

        await expect(
            Test.createTestingModule({
                imports: [SecurityDrizzleModule.forRoot()],
            }).compile(),
        ).rejects.toThrow("DB_HOST is required for the Drizzle database");
    });
});
