import { describe, expect, it } from "vitest";
import { SECURITY_AUTH_OPTIONS } from "./security-auth.constants";
import { SecurityAuthModule } from "./security-auth.module";
import { SecurityWorkflowsModule } from "./security-workflows.module";
import { SECURITY_WORKFLOW_NOTIFIER } from "./tokens";

describe("Security module factories", () => {
  it("builds auth module with custom notifier", () => {
    const notifierProvider = {
      provide: SECURITY_WORKFLOW_NOTIFIER,
      useValue: {
        sendAdminsUserEmailVerified: async () => undefined,
        sendUserAccountApproved: async () => undefined,
      },
    };

    const dynamicModule = SecurityAuthModule.forRoot({
      auth: { jwtSecret: "secret", requireAdminApproval: true },
      notifierProvider,
    });

    expect(dynamicModule.module).toBe(SecurityAuthModule);
    expect(dynamicModule.controllers).toBeDefined();
    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: SECURITY_AUTH_OPTIONS }),
        notifierProvider,
      ]),
    );
  });

  it("builds auth module with default notifier", () => {
    const dynamicModule = SecurityAuthModule.forRoot({
      auth: { jwtSecret: "secret" },
    });

    const notifier = (dynamicModule.providers ?? []).find(
      (provider) =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        (provider as { provide: symbol }).provide ===
          SECURITY_WORKFLOW_NOTIFIER,
    );

    expect(notifier).toBeDefined();
  });

  it("builds workflows module with default auth options", () => {
    const dynamicModule = SecurityWorkflowsModule.forRoot();

    expect(dynamicModule.module).toBe(SecurityWorkflowsModule);
    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: SECURITY_AUTH_OPTIONS }),
        expect.objectContaining({ provide: SECURITY_WORKFLOW_NOTIFIER }),
      ]),
    );
  });

  it("builds workflows module with custom options", () => {
    const notifierProvider = {
      provide: SECURITY_WORKFLOW_NOTIFIER,
      useValue: {
        sendAdminsUserEmailVerified: async () => undefined,
        sendUserAccountApproved: async () => undefined,
      },
    };

    const dynamicModule = SecurityWorkflowsModule.forRoot({
      auth: { jwtSecret: "custom" },
      notifierProvider,
    });

    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([notifierProvider]),
    );
  });
});
