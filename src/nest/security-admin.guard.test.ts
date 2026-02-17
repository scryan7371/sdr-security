import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SecurityAdminGuard } from "./security-admin.guard";

const makeContext = (roles?: string[]) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: { roles } }),
    }),
  }) as any;

describe("SecurityAdminGuard", () => {
  it("allows admin role", () => {
    const guard = new SecurityAdminGuard();
    expect(guard.canActivate(makeContext(["ADMIN"]))).toBe(true);
  });

  it("rejects non-admin roles", () => {
    const guard = new SecurityAdminGuard();
    expect(() => guard.canActivate(makeContext(["USER"]))).toThrow(
      ForbiddenException,
    );
  });

  it("rejects when user/roles are missing", () => {
    const guard = new SecurityAdminGuard();
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      "Admin access required",
    );
  });
});
