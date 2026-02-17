import { describe, expect, it } from "vitest";
import { api, app } from "./index";

describe("package exports", () => {
  it("exposes api and app modules", () => {
    expect(api.ADMIN_ROLE).toBe("ADMIN");
    expect(typeof app.createSecurityClient).toBe("function");
  });
});
