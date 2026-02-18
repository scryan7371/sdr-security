import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateAppUser1739490000000 } from "./1739490000000-create-app-user";
import { AddRefreshTokens1700000000001 } from "./1700000000001-add-refresh-tokens";
import { CreateSecurityIdentity1739500000000 } from "./1739500000000-create-security-identity";
import { CreateSecurityRoles1739510000000 } from "./1739510000000-create-security-roles";
import { CreateSecurityUserRoles1739515000000 } from "./1739515000000-create-security-user-roles";
import { CreatePasswordResetTokens1739520000000 } from "./1739520000000-create-password-reset-tokens";
import { CreateSecurityUser1739530000000 } from "./1739530000000-create-security-user";
import { allMigrations, securityMigrations } from "./index";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("security migrations", () => {
  it("exports all migration list for test/dev", () => {
    expect(allMigrations.length).toBe(7);
    expect(allMigrations).toEqual([
      CreateAppUser1739490000000,
      AddRefreshTokens1700000000001,
      CreateSecurityIdentity1739500000000,
      CreateSecurityRoles1739510000000,
      CreateSecurityUserRoles1739515000000,
      CreatePasswordResetTokens1739520000000,
      CreateSecurityUser1739530000000,
    ]);
  });

  it("exports migration list", () => {
    expect(securityMigrations.length).toBe(6);
    expect(securityMigrations).toEqual([
      AddRefreshTokens1700000000001,
      CreateSecurityIdentity1739500000000,
      CreateSecurityRoles1739510000000,
      CreateSecurityUserRoles1739515000000,
      CreatePasswordResetTokens1739520000000,
      CreateSecurityUser1739530000000,
    ]);
  });

  it("runs app user migration up/down", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new CreateAppUser1739490000000();

    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "public"."app_user"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE IF EXISTS "public"."app_user"'),
    );
  });

  it("runs refresh token migration up/down", async () => {
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

  it("runs security identity migration up/down", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
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

  it("runs security role migration up/down", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new CreateSecurityRoles1739510000000();

    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "security_role"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE IF EXISTS "security_role"'),
    );
  });

  it("runs security user role migration up/down", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new CreateSecurityUserRoles1739515000000();

    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "security_user_role"',
      ),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE IF EXISTS "security_user_role"'),
    );
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

  it("runs security user migration up/down", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new CreateSecurityUser1739530000000();

    await migration.up({ query });
    await migration.down({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "security_user"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE IF EXISTS "security_user"'),
    );
  });

  it("uses user schema/table env safely", async () => {
    process.env.USER_TABLE = "users";
    process.env.USER_TABLE_SCHEMA = "security";
    const query = vi.fn().mockResolvedValue(undefined);

    await new CreateSecurityUser1739530000000().up({ query });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('REFERENCES "security"."users" ("id")'),
    );
  });

  it("throws for invalid identifiers", async () => {
    process.env.USER_TABLE = "bad-name!";
    const query = vi.fn().mockResolvedValue(undefined);

    await expect(
      new CreateSecurityUserRoles1739515000000().up({ query }),
    ).rejects.toThrow("Invalid SQL identifier");
  });
});
