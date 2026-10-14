import {createHash} from "node:crypto";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {SecuritySocialService} from "./security-social.service";
import type {SecurityDatabase} from "./security-drizzle.module";
import type {SecurityAuthService} from "./security-auth.service";
import type {SecurityWorkflowsService} from "./security-workflows.service";
import type {SecurityAuthModuleOptions} from "./security-auth.options";
import {exchangeIdentity} from "./social-oidc";

vi.mock("./social-oidc", async importOriginal => ({
    ...await importOriginal<typeof import("./social-oidc")>(), exchangeIdentity: vi.fn(),
}));

const config = (): SecurityAuthModuleOptions => ({jwtSecret: "test", social: {
    allowedReturnUrls: ["https://app.example/", "http://localhost:8081/", "joinourplans://oauth"],
    google: {clientId: "client", clientSecret: "secret", callbackUrl: "https://api.example/google"},
    apple: {clientId: "apple", teamId: "team", keyId: "key", privateKey: "unused", callbackUrl: "https://api.example/apple"},
}});
const setup = (options = config()) => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockResolvedValue(undefined);
    const selectWhere = vi.fn().mockResolvedValue([]);
    const db = {
        delete: vi.fn(() => ({where: vi.fn(() => ({returning}))})),
        insert: vi.fn(() => ({values})),
        select: vi.fn(() => ({from: vi.fn(() => ({where: selectWhere}))})),
    };
    return {service: new SecuritySocialService(db as unknown as SecurityDatabase, options, {} as SecurityAuthService, {} as SecurityWorkflowsService), db, returning, values, selectWhere};
};
const state = "s".repeat(43);
const verifier = "v".repeat(43);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const attempt = {appChallenge: "c".repeat(43), providerVerifier: "provider-verifier", nonce: "nonce", returnUrl: "https://app.example/"};

describe("social auth request boundaries", () => {
    beforeEach(() => { vi.mocked(exchangeIdentity).mockReset(); });
    it("advertises only configured providers", () => {
        expect(setup({jwtSecret: "test"}).service.providers()).toEqual([]);
        expect(setup().service.providers()).toEqual(["google", "apple"]);
    });
    it.each([undefined, "github", "apple"])("rejects unknown or disabled provider %s", async provider => {
        const {service, db} = setup({jwtSecret: "test"});
        await expect(service.start(provider, "https://app.example/", state)).rejects.toThrow("not configured");
        expect(db.insert).not.toHaveBeenCalled();
    });
    it.each([[undefined, state], ["https://evil.example/", state], ["https://app.example/", undefined], ["https://app.example/", "short"]])("rejects invalid start input %#", async (url, challenge) => {
        await expect(setup().service.start("google", url, challenge)).rejects.toThrow("Invalid sign-in request");
    });
    it.each(["https://app.example/#fragment", "https://app.example/?query=1", "https://user@app.example/", "https://:password@app.example/", "file://app.example/", "custom:opaque", "http://app.example/"])("rejects unsafe configured return URL %s", async url => {
        const options = config(); options.social!.allowedReturnUrls = [url];
        await expect(setup(options).service.start("google", url, state)).rejects.toThrow("Invalid return URL");
    });
    it.each(["https://app.example/", "http://localhost:8081/", "joinourplans://oauth"])("binds state, nonce and PKCE to %s", async url => {
        const {service, values} = setup();
        const result = new URL((await service.start("google", url, state)).authorizationUrl);
        const stored = values.mock.calls[0][0];
        expect(stored).toMatchObject({stateHash: digest(result.searchParams.get("state")!), nonce: result.searchParams.get("nonce"), appChallenge: state, returnUrl: url});
        expect(createHash("sha256").update(stored.providerVerifier).digest("base64url")).toBe(result.searchParams.get("code_challenge"));
        expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600000);
    });
    it("returns the persisted method and rejects missing accounts", async () => {
        const {service, selectWhere} = setup();
        await expect(service.signInMethod("missing")).rejects.toThrow("User not found");
        selectWhere.mockResolvedValueOnce([{method: "apple"}]);
        expect(await service.signInMethod("user")).toEqual({method: "apple"});
    });
    it.each([undefined, "short"])("rejects malformed callback state %s before database access", async state => {
        const {service, db} = setup();
        await expect(service.callback("google", {state})).rejects.toThrow("Invalid or expired");
        expect(db.delete).not.toHaveBeenCalled();
    });
    it("rejects expired or already consumed callback state", async () => {
        await expect(setup().service.callback("google", {state, code: "code"})).rejects.toThrow("Invalid or expired");
    });
    it.each([{error: "access_denied"}, {error: "server_error"}, {code: undefined}, {code: ""}, {code: "x".repeat(4097)}])("returns a bound error ticket without calling the provider %#", async params => {
        const {service, returning, values} = setup(); returning.mockResolvedValueOnce([attempt]);
        const url = new URL(await service.callback("google", {state, ...params}));
        expect(url.origin).toBe("https://app.example");
        expect(values.mock.calls[0][0]).toMatchObject({ticketHash: digest(url.searchParams.get("social_ticket")!), appChallenge: attempt.appChallenge, error: params.error === "access_denied" ? "cancelled" : "provider_failed"});
        expect(exchangeIdentity).not.toHaveBeenCalled();
    });
    it.each([undefined, '{bad', '{}', '{"name":{"firstName":"  Jane  ","lastName":" Doe "}}'])("treats Apple's first-consent names as optional display data %#", async user => {
        const {service, returning, values} = setup(); returning.mockResolvedValueOnce([attempt]);
        vi.mocked(exchangeIdentity).mockResolvedValueOnce({provider: "apple", subject: "subject", email: "relay@example.com", firstName: "", lastName: ""});
        await service.callback("apple", {state, code: "code", user});
        expect(exchangeIdentity).toHaveBeenCalledWith("apple", expect.any(Object), "code", attempt.providerVerifier, attempt.nonce);
        expect(values.mock.calls[0][0].identity).toMatchObject({subject: "subject", email: "relay@example.com", firstName: user?.includes("Jane") ? "Jane" : "", lastName: user?.includes("Doe") ? "Doe" : ""});
    });
    it("does not leak provider errors into the redirect", async () => {
        const {service, returning, values} = setup(); returning.mockResolvedValueOnce([attempt]);
        vi.mocked(exchangeIdentity).mockRejectedValueOnce(new Error("sensitive provider detail"));
        const result = await service.callback("google", {state, code: "code"});
        expect(result).not.toContain("sensitive");
        expect(values.mock.calls[0][0].error).toBe("provider_failed");
    });
    it.each([[undefined, verifier], ["short", verifier], [state, undefined], [state, "short"]])("rejects malformed app exchange %#", async (ticket, verifier) => {
        const {service, db} = setup();
        await expect(service.finish(ticket, verifier)).rejects.toThrow("Invalid sign-in exchange");
        expect(db.delete).not.toHaveBeenCalled();
    });
    it("rejects a missing, consumed, expired or incorrectly bound ticket", async () => {
        await expect(setup().service.finish(state, verifier)).rejects.toThrow("Sign-in expired");
    });
    it.each([[{error: "cancelled"}, "cancelled"], [{error: "provider_failed"}, "Unable to verify"], [{identity: null}, "Unable to verify"]])("maps failed exchange tickets safely %#", async (record, message) => {
        const {service, returning} = setup(); returning.mockResolvedValueOnce([record]);
        await expect(service.finish(state, verifier)).rejects.toThrow(message as string);
    });
});
