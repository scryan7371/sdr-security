import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { SecurityAuthController } from "./security-auth.controller";

const routeMeta = (methodName: keyof SecurityAuthController) => {
  const handler = SecurityAuthController.prototype[methodName] as object;
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    status: Reflect.getMetadata(HTTP_CODE_METADATA, handler),
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

  it("uses 200 for POST actions that do not create resources", () => {
    expect(routeMeta("register").status).toBeUndefined();
    expect(routeMeta("login").status).toBe(200);
    expect(routeMeta("refresh").status).toBe(200);
    expect(routeMeta("logout").status).toBe(200);
    expect(routeMeta("changePassword").status).toBe(200);
    expect(routeMeta("forgotPassword").status).toBe(200);
    expect(routeMeta("resetPassword").status).toBe(200);
  });
});
