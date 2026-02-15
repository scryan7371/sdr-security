import { describe, expect, it } from "vitest";
import { hasRole, isAdmin, normalizeRoleName } from "./roles";

describe("roles", () => {
  it("normalizes role names", () => {
    expect(normalizeRoleName("admin")).toBe("ADMIN");
    expect(normalizeRoleName("case manager")).toBe("CASE_MANAGER");
    expect(normalizeRoleName("ADMINISTRATOR")).toBe("ADMIN");
  });

  it("checks role membership", () => {
    expect(hasRole(["ADMIN", "MEMBER"], "admin")).toBe(true);
    expect(hasRole(["MEMBER"], "ADMIN")).toBe(false);
  });

  it("checks admin role", () => {
    expect(isAdmin(["ADMIN"])).toBe(true);
    expect(isAdmin(["MEMBER"])).toBe(false);
  });
});
