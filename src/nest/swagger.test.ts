import { describe, expect, it, vi } from "vitest";
import { setupSecuritySwagger } from "./swagger";
import { SwaggerModule } from "@nestjs/swagger";

describe("setupSecuritySwagger", () => {
  it("creates swagger document and mounts UI", () => {
    const app = {} as any;
    const document = { openapi: "3.0.0" } as any;

    const createSpy = vi
      .spyOn(SwaggerModule, "createDocument")
      .mockReturnValue(document);
    const setupSpy = vi.spyOn(SwaggerModule, "setup").mockImplementation(() => {
      return;
    });

    const result = setupSecuritySwagger(app, "docs/custom-security");

    expect(createSpy).toHaveBeenCalled();
    expect(setupSpy).toHaveBeenCalledWith(
      "docs/custom-security",
      app,
      document,
    );
    expect(result).toBe(document);
  });
});
