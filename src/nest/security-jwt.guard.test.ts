import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("jsonwebtoken", () => ({
  verify: vi.fn(),
}));

import { verify } from "jsonwebtoken";
import { SecurityJwtGuard } from "./security-jwt.guard";

const mockedVerify = vi.mocked(verify);

const makeContext = (headers?: Record<string, string | undefined>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  }) as any;

describe("SecurityJwtGuard", () => {
  it("throws when header is missing", () => {
    const guard = new SecurityJwtGuard({ jwtSecret: "secret" });
    expect(() => guard.canActivate(makeContext())).toThrow(
      UnauthorizedException,
    );
  });

  it("throws when token is invalid", () => {
    mockedVerify.mockImplementation(() => {
      throw new Error("bad token");
    });

    const guard = new SecurityJwtGuard({ jwtSecret: "secret" });
    expect(() =>
      guard.canActivate(makeContext({ authorization: "Bearer token" })),
    ).toThrow("Invalid token");
  });

  it("attaches user payload on success", () => {
    mockedVerify.mockReturnValue({
      sub: "user-1",
      email: "user@example.com",
      roles: ["ADMIN"],
    } as never);

    const request = {
      headers: { Authorization: "Bearer good-token" },
      user: undefined,
    } as any;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    const guard = new SecurityJwtGuard({ jwtSecret: "secret" });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({
      sub: "user-1",
      email: "user@example.com",
      roles: ["ADMIN"],
    });
  });
});
