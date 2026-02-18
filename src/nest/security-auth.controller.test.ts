import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityAuthController } from "./security-auth.controller";

const makeAuthService = () => ({
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  requestForgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmailByToken: vi.fn(),
  getMyRoles: vi.fn(),
});

describe("SecurityAuthController", () => {
  let service: ReturnType<typeof makeAuthService>;
  let controller: SecurityAuthController;

  beforeEach(() => {
    service = makeAuthService();
    controller = new SecurityAuthController(service as never);
  });

  it("validates register payload", async () => {
    await expect(controller.register({ email: "a" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("registers user", async () => {
    service.register.mockResolvedValue({ success: true });
    const result = await controller.register({
      email: "user@example.com",
      password: "Secret123",
    });
    expect(result).toEqual({ success: true });
    expect(service.register).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Secret123",
    });
  });

  it("validates login and refresh payloads", async () => {
    await expect(controller.login({ email: "x" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.refresh({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("delegates login/refresh/logout", async () => {
    service.login.mockResolvedValue({ accessToken: "a" });
    service.refresh.mockResolvedValue({ accessToken: "b" });
    service.logout.mockResolvedValue({ success: true });

    await expect(
      controller.login({ email: "user@example.com", password: "pw" }),
    ).resolves.toEqual({ accessToken: "a" });
    await expect(controller.refresh({ refreshToken: "rt" })).resolves.toEqual({
      accessToken: "b",
    });
    await expect(controller.logout({ refreshToken: "rt" })).resolves.toEqual({
      success: true,
    });
  });

  it("validates and delegates change password", async () => {
    await expect(
      controller.changePassword(
        { user: { sub: "u1" } },
        { currentPassword: "a" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    service.changePassword.mockResolvedValue({ success: true });
    await controller.changePassword(
      { user: { sub: "u1" } },
      { currentPassword: "a", newPassword: "b" },
    );
    expect(service.changePassword).toHaveBeenCalledWith({
      userId: "u1",
      currentPassword: "a",
      newPassword: "b",
    });
  });

  it("validates and delegates forgot/reset", async () => {
    await expect(controller.forgotPassword({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.resetPassword({ token: "t" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    service.requestForgotPassword.mockResolvedValue({ success: true });
    service.resetPassword.mockResolvedValue({ success: true });

    await controller.forgotPassword({ email: "user@example.com" });
    await controller.resetPassword({ token: "t", newPassword: "pw" });

    expect(service.requestForgotPassword).toHaveBeenCalledWith(
      "user@example.com",
    );
    expect(service.resetPassword).toHaveBeenCalledWith("t", "pw");
  });

  it("validates and delegates verify email", async () => {
    await expect(controller.verifyEmail(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    service.verifyEmailByToken.mockResolvedValue({ success: true });
    await expect(controller.verifyEmail("token-1")).resolves.toEqual({
      success: true,
    });
    expect(service.verifyEmailByToken).toHaveBeenCalledWith("token-1");
  });

  it("delegates getMyRoles", async () => {
    service.getMyRoles.mockResolvedValue({ userId: "u1", roles: ["ADMIN"] });
    await expect(
      controller.getMyRoles({ user: { sub: "u1" } }),
    ).resolves.toEqual({ userId: "u1", roles: ["ADMIN"] });
  });
});
