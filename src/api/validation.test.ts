import { describe, expect, it } from "vitest";
import { isStrongPassword, isValidEmail, sanitizeEmail } from "./validation";

describe("validation", () => {
  it("sanitizes email", () => {
    expect(sanitizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("validates email format", () => {
    expect(isValidEmail("bad-email")).toBe(false);
    expect(isValidEmail("u@e\\.c")).toBe(true);
  });

  it("checks password strength", () => {
    expect(isStrongPassword("Abc123")).toBe(false);
    expect(isStrongPassword("lowercase123")).toBe(false);
    expect(isStrongPassword("UPPERCASE123")).toBe(false);
    expect(isStrongPassword("NoDigitsHere")).toBe(false);
    expect(isStrongPassword("Abc\\d")).toBe(true);
  });
});
