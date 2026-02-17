import { afterEach, describe, expect, it, vi } from "vitest";
import { AddRefreshTokens1700000000001 } from "./1700000000001-add-refresh-tokens";
import { AddGoogleSubjectToUser1739490000000 } from "./1739490000000-add-google-subject-to-user";
import { CreateSecurityIdentity1739500000000 } from "./1739500000000-create-security-identity";
import { CreateSecurityRoles1739510000000 } from "./1739510000000-create-security-roles";
import { CreatePasswordResetTokens1739520000000 } from "./1739520000000-create-password-reset-tokens";
import { securityMigrations } from "./index";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("security migrations", () => {
  it("exports migration list", () => {
    expect(securityMigrations.length).toBe(5);
    expect(securityMigrations[0]).toBe(AddRefreshTokens1700000000001);
  });

  it("runs add refresh tokens migration up/down", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new AddRefreshTokens1700000000001();

    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE "refresh_token"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE "refresh_token"'),
    );
  });

  it("uses schema/table env in refresh token migration", async () => {
    process.env.USER_TABLE = "users";
    process.env.USER_TABLE_SCHEMA = "security";
    const query = vi.fn().mockResolvedValue(undefined);

    await new AddRefreshTokens1700000000001().up({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('REFERENCES "security"."users" ("id")'),
    );
  });

  it("throws for invalid identifiers in refresh token migration", async () => {
    process.env.USER_TABLE = "bad-name;drop";
    const query = vi.fn().mockResolvedValue(undefined);

    await expect(
      new AddRefreshTokens1700000000001().up({ query }),
    ).rejects.toThrow("Invalid SQL identifier");
  });

  it("keeps legacy google subject migration as no-op", async () => {
    const migration = new AddGoogleSubjectToUser1739490000000();
    await expect(migration.up()).resolves.toBeUndefined();
    await expect(migration.down()).resolves.toBeUndefined();
  });

  it("runs security identity migration path with google_subject present", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const migration = new CreateSecurityIdentity1739500000000();
    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "security_identity"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE IF EXISTS "security_identity"'),
    );
  });

  it("skips google_subject migration block when column absent", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await new CreateSecurityIdentity1739500000000().up({ query });

    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DROP COLUMN IF EXISTS "google_subject"'),
    );
  });

  it("throws for invalid identifiers in identity migration", async () => {
    process.env.USER_TABLE_SCHEMA = "bad-schema!";
    const query = vi.fn().mockResolvedValue(undefined);

    await expect(
      new CreateSecurityIdentity1739500000000().up({ query }),
    ).rejects.toThrow("Invalid SQL identifier");
  });

  it("runs security roles migration path with legacy role column", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const migration = new CreateSecurityRoles1739510000000();
    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "security_role"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "security_user_role"',
      ),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE IF EXISTS "security_user_role"'),
    );
  });

  it("skips legacy role backfill when role column absent", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await new CreateSecurityRoles1739510000000().up({ query });

    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DROP COLUMN IF EXISTS "role"'),
    );
  });

  it("throws for invalid identifiers in roles migration", async () => {
    process.env.USER_TABLE = "bad-name*";
    const query = vi.fn().mockResolvedValue(undefined);

    await expect(
      new CreateSecurityRoles1739510000000().up({ query }),
    ).rejects.toThrow("Invalid SQL identifier");
  });

  it("runs password reset token migration up/down", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new CreatePasswordResetTokens1739520000000();

    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "security_password_reset_token"',
      ),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DROP TABLE IF EXISTS "security_password_reset_token"',
      ),
    );
  });

  it("uses default public schema in password reset migration", async () => {
    const query = vi.fn().mockResolvedValue(undefined);

    await new CreatePasswordResetTokens1739520000000().up({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('REFERENCES "public"."app_user" ("id")'),
    );
  });

  it("throws for invalid identifiers in password reset migration", async () => {
    process.env.USER_TABLE_SCHEMA = "bad.schema";
    const query = vi.fn().mockResolvedValue(undefined);

    await expect(
      new CreatePasswordResetTokens1739520000000().up({ query }),
    ).rejects.toThrow("Invalid SQL identifier");
  });
});
