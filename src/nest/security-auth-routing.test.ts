import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { SecurityAuthController } from "./security-auth.controller";

const routeMeta = (methodName: keyof SecurityAuthController) => {
  const handler = SecurityAuthController.prototype[methodName] as object;
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler),
  };
};

describe("SecurityAuthController route metadata", () => {
  it("defines the expected controller base path", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SecurityAuthController)).toBe(
      "security/auth",
    );
  });

  it("defines the expected auth routes", () => {
    expect(routeMeta("register").path).toBe("register");
    expect(routeMeta("login").path).toBe("login");
    expect(routeMeta("refresh").path).toBe("refresh");
    expect(routeMeta("logout").path).toBe("logout");
    expect(routeMeta("changePassword").path).toBe("change-password");
    expect(routeMeta("forgotPassword").path).toBe("forgot-password");
    expect(routeMeta("resetPassword").path).toBe("reset-password");
    expect(routeMeta("verifyEmail").path).toBe("verify-email");
  });
});
