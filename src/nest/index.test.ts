import { describe, expect, it } from "vitest";
import {
  SecurityAdminGuard,
  SecurityAuthController,
  SecurityAuthModule,
  SecurityJwtGuard,
  SecurityWorkflowsController,
  SecurityWorkflowsModule,
} from "./index";

describe("nest exports", () => {
  it("exports core module surface", () => {
    expect(SecurityAuthModule).toBeDefined();
    expect(SecurityWorkflowsModule).toBeDefined();
    expect(SecurityAuthController).toBeDefined();
    expect(SecurityWorkflowsController).toBeDefined();
    expect(SecurityJwtGuard).toBeDefined();
    expect(SecurityAdminGuard).toBeDefined();
  });
});
