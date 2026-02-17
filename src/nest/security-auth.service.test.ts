import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("bcryptjs", () => ({
  hash: vi.fn(async (value: string) => `hashed:${value}`),
  compare: vi.fn(
    async (plain: string, hashed: string) => hashed === `hashed:${plain}`,
  ),
}));

vi.mock("crypto", () => ({
  randomBytes: vi.fn(() => ({ toString: () => "token-bytes" })),
  randomUUID: vi.fn(() => "uuid-1"),
}));

vi.mock("jsonwebtoken", () => ({
  sign: vi.fn(() => "signed-access-token"),
}));

import { compare } from "bcryptjs";
import { sign } from "jsonwebtoken";
import { SecurityAuthService } from "./security-auth.service";

const makeRepo = () => ({
  findOne: vi.fn(),
  save: vi.fn(async (value: any) => value),
  create: vi.fn((value: any) => value),
  update: vi.fn(async () => ({ affected: 1 })),
  find: vi.fn(async () => []),
});

const makeNotifier = () => ({
  sendEmailVerification: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(async () => undefined),
  sendAdminsUserEmailVerified: vi.fn(async () => undefined),
  sendUserAccountApproved: vi.fn(async () => undefined),
});

const makeUser = () => ({
  id: "user-1",
  email: "user@example.com",
  passwordHash: "hashed:Secret123",
  firstName: "A",
  lastName: "B",
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  emailVerificationToken: null,
  adminApprovedAt: new Date("2026-01-01T00:00:00.000Z"),
  isActive: true,
});

const setup = () => {
  const usersRepo = makeRepo();
  const refreshTokenRepo = makeRepo();
  const passwordResetRepo = makeRepo();
  const rolesRepo = makeRepo();
  const userRolesRepo = makeRepo();
  const notifier = makeNotifier();

  const service = new SecurityAuthService(
    usersRepo as never,
    refreshTokenRepo as never,
    passwordResetRepo as never,
    rolesRepo as never,
    userRolesRepo as never,
    {
      jwtSecret: "secret",
      accessTokenExpiresIn: "15m",
      refreshTokenExpiresInDays: 30,
      requireEmailVerification: true,
      requireAdminApproval: true,
      passwordResetTokenExpiresInMinutes: 30,
    },
    notifier as never,
  );

  return {
    service,
    usersRepo,
    refreshTokenRepo,
    passwordResetRepo,
    rolesRepo,
    userRolesRepo,
    notifier,
  };
};

describe("SecurityAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers user and sends verification", async () => {
    const { service, usersRepo, userRolesRepo, rolesRepo, notifier } = setup();
    usersRepo.findOne.mockResolvedValue(null);
    usersRepo.save.mockResolvedValue(makeUser());
    userRolesRepo.find.mockResolvedValue([]);
    rolesRepo.find.mockResolvedValue([]);

    const result = await service.register({
      email: "USER@example.com",
      password: "Secret123",
      firstName: "A",
      lastName: "B",
    });

    expect(result.success).toBe(true);
    expect(usersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" }),
    );
    expect(notifier.sendEmailVerification).toHaveBeenCalled();
  });

  it("rejects duplicate email on register", async () => {
    const { service, usersRepo } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());

    await expect(
      service.register({ email: "user@example.com", password: "Secret123" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("handles login success and auth failures", async () => {
    const { service, usersRepo, userRolesRepo, rolesRepo, refreshTokenRepo } =
      setup();
    const user = makeUser();

    usersRepo.findOne.mockResolvedValue(user);
    userRolesRepo.find.mockResolvedValue([{ roleId: "r1" }]);
    rolesRepo.find.mockResolvedValue([{ id: "r1", roleKey: "admin" }]);

    const auth = await service.login({
      email: user.email,
      password: "Secret123",
    });
    expect(auth.accessToken).toBe("signed-access-token");
    expect(sign).toHaveBeenCalled();
    expect(refreshTokenRepo.save).toHaveBeenCalled();

    usersRepo.findOne.mockResolvedValue(null);
    await expect(
      service.login({ email: "none@example.com", password: "Secret123" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("blocks login when account is inactive or missing approvals", async () => {
    const { service, usersRepo } = setup();
    const inactive = { ...makeUser(), isActive: false };
    usersRepo.findOne.mockResolvedValue(inactive);
    await expect(
      service.login({ email: inactive.email, password: "Secret123" }),
    ).rejects.toThrow("Account is inactive");

    usersRepo.findOne.mockResolvedValue({
      ...makeUser(),
      emailVerifiedAt: null,
    });
    await expect(
      service.login({ email: "x@example.com", password: "Secret123" }),
    ).rejects.toThrow("Email verification required");

    usersRepo.findOne.mockResolvedValue({
      ...makeUser(),
      adminApprovedAt: null,
    });
    await expect(
      service.login({ email: "x@example.com", password: "Secret123" }),
    ).rejects.toThrow("Admin approval required");
  });

  it("refreshes and revokes tokens", async () => {
    const { service, usersRepo, refreshTokenRepo, userRolesRepo, rolesRepo } =
      setup();
    refreshTokenRepo.find.mockResolvedValue([
      {
        id: "rt1",
        userId: "user-1",
        tokenHash: "hashed:token-bytes",
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    usersRepo.findOne.mockResolvedValue(makeUser());
    userRolesRepo.find.mockResolvedValue([]);
    rolesRepo.find.mockResolvedValue([]);

    const result = await service.refresh("token-bytes");
    expect(result.accessToken).toBe("signed-access-token");
    expect(refreshTokenRepo.update).toHaveBeenCalledWith(
      { id: "rt1" },
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );

    await expect(service.logout()).resolves.toEqual({ success: true });
    await expect(service.logout("token-bytes")).resolves.toEqual({
      success: true,
    });
  });

  it("rejects invalid refresh token and missing refresh user", async () => {
    const { service, refreshTokenRepo, usersRepo } = setup();
    refreshTokenRepo.find.mockResolvedValue([]);

    await expect(service.refresh("bad-token")).rejects.toThrow(
      "Invalid refresh token",
    );

    refreshTokenRepo.find.mockResolvedValue([
      {
        id: "rt1",
        userId: "missing",
        tokenHash: "hashed:token-bytes",
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    usersRepo.findOne.mockResolvedValue(null);

    await expect(service.refresh("token-bytes")).rejects.toThrow(
      "User not found",
    );
  });

  it("changes password", async () => {
    const { service, usersRepo } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());

    await expect(
      service.changePassword({
        userId: "user-1",
        currentPassword: "Secret123",
        newPassword: "NewPass1",
      }),
    ).resolves.toEqual({ success: true });

    usersRepo.findOne.mockResolvedValue(null);
    await expect(
      service.changePassword({
        userId: "missing",
        currentPassword: "Secret123",
        newPassword: "NewPass1",
      }),
    ).rejects.toThrow("User not found");
  });

  it("handles forgot/reset password flow", async () => {
    const { service, usersRepo, passwordResetRepo, notifier } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());
    passwordResetRepo.findOne.mockResolvedValue({
      id: "pr1",
      userId: "user-1",
      token: "token-bytes",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.requestForgotPassword("user@example.com"),
    ).resolves.toEqual({
      success: true,
    });
    expect(passwordResetRepo.save).toHaveBeenCalled();
    expect(notifier.sendPasswordReset).toHaveBeenCalled();

    await expect(
      service.resetPassword("token-bytes", "NewPass1"),
    ).resolves.toEqual({
      success: true,
    });
  });

  it("returns success for unknown forgot email and rejects bad reset token", async () => {
    const { service, usersRepo, passwordResetRepo } = setup();
    usersRepo.findOne.mockResolvedValue(null);
    await expect(
      service.requestForgotPassword("none@example.com"),
    ).resolves.toEqual({
      success: true,
    });

    passwordResetRepo.findOne.mockResolvedValue(null);
    await expect(service.resetPassword("bad", "x")).rejects.toThrow(
      "Invalid password reset token",
    );

    passwordResetRepo.findOne.mockResolvedValue({
      id: "pr1",
      userId: "user-1",
      token: "bad",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.resetPassword("bad", "x")).rejects.toThrow(
      "Invalid password reset token",
    );
  });

  it("verifies email token and reads user roles", async () => {
    const { service, usersRepo, userRolesRepo, rolesRepo } = setup();
    usersRepo.findOne
      .mockResolvedValueOnce(makeUser())
      .mockResolvedValueOnce(makeUser());
    userRolesRepo.find.mockResolvedValue([{ roleId: "r1" }]);
    rolesRepo.find.mockResolvedValue([{ id: "r1", roleKey: "coach" }]);

    await expect(service.verifyEmailByToken("token-bytes")).resolves.toEqual({
      success: true,
    });
    await expect(service.getMyRoles("user-1")).resolves.toEqual({
      userId: "user-1",
      roles: ["COACH"],
    });
  });

  it("rejects invalid email verification token", async () => {
    const { service, usersRepo } = setup();
    usersRepo.findOne.mockResolvedValue(null);

    await expect(service.verifyEmailByToken("missing")).rejects.toThrow(
      "Invalid verification token",
    );
  });

  it("handles refresh with expired matching token", async () => {
    const { service, refreshTokenRepo } = setup();
    refreshTokenRepo.find.mockResolvedValue([
      {
        id: "rt1",
        userId: "user-1",
        tokenHash: "hashed:token-bytes",
        expiresAt: new Date(Date.now() - 1),
      },
    ]);

    await expect(service.refresh("token-bytes")).rejects.toThrow(
      "Invalid refresh token",
    );
    expect(compare).toHaveBeenCalled();
  });
});
