import { PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { SecurityWorkflowsController } from "./security-workflows.controller";

const routePath = (methodName: keyof SecurityWorkflowsController) =>
  Reflect.getMetadata(
    PATH_METADATA,
    SecurityWorkflowsController.prototype[methodName] as object,
  );

describe("SecurityWorkflowsController route metadata", () => {
  it("defines the expected controller base path", () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, SecurityWorkflowsController),
    ).toBe("security/workflows");
  });

  it("defines the expected workflow routes", () => {
    expect(routePath("markEmailVerified")).toBe("users/:id/email-verified");
    expect(routePath("setAdminApproval")).toBe("users/:id/admin-approval");
    expect(routePath("setUserActive")).toBe("users/:id/active");
    expect(routePath("listRoles")).toBe("roles");
    expect(routePath("createRole")).toBe("roles");
    expect(routePath("removeRole")).toBe("roles/:role");
    expect(routePath("getUserRoles")).toBe("users/:userId/roles");
    expect(routePath("setUserRoles")).toBe("users/:userId/roles");
    expect(routePath("assignUserRole")).toBe("users/:userId/roles");
    expect(routePath("removeUserRole")).toBe("users/:userId/roles/:role");
  });
});
