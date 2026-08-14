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

  it("builds auth module with working default providers", async () => {
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

    const defaultNotifier = notifier as {
      useValue: {
        sendEmailVerification: () => Promise<void>;
        sendPasswordReset: () => Promise<void>;
        sendAdminsUserEmailVerified: () => Promise<void>;
        sendUserAccountApproved: () => Promise<void>;
      };
    };

    expect(dynamicModule.exports).toBeDefined();
    await expect(
      defaultNotifier.useValue.sendEmailVerification(),
    ).resolves.toBeUndefined();
    await expect(
      defaultNotifier.useValue.sendPasswordReset(),
    ).resolves.toBeUndefined();
    await expect(
      defaultNotifier.useValue.sendAdminsUserEmailVerified(),
    ).resolves.toBeUndefined();
    await expect(
      defaultNotifier.useValue.sendUserAccountApproved(),
    ).resolves.toBeUndefined();
  });

  it("builds workflows module with working default providers", async () => {
    const dynamicModule = SecurityWorkflowsModule.forRoot();
    const providers = dynamicModule.providers ?? [];
    const authProvider = providers.find(
      (provider) =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        provider.provide === SECURITY_AUTH_OPTIONS,
    ) as { useValue: { jwtSecret: string } };
    const notifierProvider = providers.find(
      (provider) =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        provider.provide === SECURITY_WORKFLOW_NOTIFIER,
    ) as {
      useValue: {
        sendAdminsUserEmailVerified: () => Promise<void>;
        sendUserAccountApproved: () => Promise<void>;
      };
    };

    expect(dynamicModule.module).toBe(SecurityWorkflowsModule);
    expect(authProvider.useValue).toEqual({ jwtSecret: "dev-secret" });
    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: SECURITY_AUTH_OPTIONS }),
        expect.objectContaining({ provide: SECURITY_WORKFLOW_NOTIFIER }),
      ]),
    );
    await expect(
      notifierProvider.useValue.sendAdminsUserEmailVerified(),
    ).resolves.toBeUndefined();
    await expect(
      notifierProvider.useValue.sendUserAccountApproved(),
    ).resolves.toBeUndefined();
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
