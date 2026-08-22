import { describe, expect, it } from "vitest";
import { isStrongPassword, isValidEmail, sanitizeEmail } from "./validation";

describe("validation", () => {
  it("sanitizes email", () => {
    expect(sanitizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("validates email format", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.co.uk")).toBe(true);
    expect(isValidEmail("bad-email")).toBe(false);
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("user @example.com")).toBe(false);
    expect(isValidEmail("user@example.com ")).toBe(false);
  });

  it("checks password strength", () => {
    expect(isStrongPassword("lowercase123")).toBe(false);
    expect(isStrongPassword("UPPERCASE123")).toBe(false);
    expect(isStrongPassword("NoDigitsHere")).toBe(false);
    expect(isStrongPassword("Abc123")).toBe(true);
    expect(isStrongPassword("Abc\\d")).toBe(false);
  });
});
