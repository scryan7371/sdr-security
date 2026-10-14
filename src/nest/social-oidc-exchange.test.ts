import {generateKeyPairSync} from "node:crypto";
import {sign, verify} from "jsonwebtoken";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {SocialAuthOptions} from "./security-social.options";

// Provider HTTP responses are controlled here; JWT signing and verification are real.
// This is protocol coverage, not a substitute for live provider acceptance tests.
const rsa = generateKeyPairSync("rsa", {modulusLength: 2048});
const appleKey = generateKeyPairSync("ec", {namedCurve: "prime256v1"});
const jwk = {...rsa.publicKey.export({format: "jwk"}), kid: "key-1", alg: "RS256", use: "sig"};
const options: SocialAuthOptions = {
    allowedReturnUrls: ["https://app.example/"],
    google: {clientId: "google-client", clientSecret: "google-secret", callbackUrl: "https://api.example/google"},
    apple: {clientId: "apple-client", teamId: "team", keyId: "apple-key", privateKey: appleKey.privateKey.export({format: "pem", type: "pkcs8"}).toString(), callbackUrl: "https://api.example/apple"},
};
const idToken = (provider = "google", kid: string | undefined = "key-1") => sign({
    sub: "subject", email: "user@example.com", email_verified: true, nonce: "nonce",
}, rsa.privateKey, {algorithm: "RS256", keyid: kid,
    issuer: provider === "google" ? "https://accounts.google.com" : "https://appleid.apple.com",
    audience: `${provider}-client`, expiresIn: "5m"});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

describe("OIDC code exchange", () => {
    const fetcher = vi.fn<typeof fetch>();
    beforeEach(() => { vi.resetModules(); fetcher.mockReset(); vi.stubGlobal("fetch", fetcher); });
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

    it("exchanges Google codes with PKCE, verifies the returned token, and caches keys", async () => {
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: idToken()})).mockResolvedValueOnce(json({keys: [jwk]})).mockResolvedValueOnce(json({id_token: idToken()}));
        expect(await exchangeIdentity("google", options, "code", "verifier", "nonce")).toMatchObject({provider: "google", subject: "subject"});
        expect(await exchangeIdentity("google", options, "code-2", "verifier", "nonce")).toMatchObject({email: "user@example.com"});
        expect(fetcher).toHaveBeenCalledTimes(3);
        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe("https://oauth2.googleapis.com/token");
        expect(init).toMatchObject({method: "POST", redirect: "error"});
        expect(Object.fromEntries(new URLSearchParams(init!.body as string))).toEqual({grant_type: "authorization_code", code: "code", client_id: "google-client", client_secret: "google-secret", redirect_uri: options.google!.callbackUrl, code_verifier: "verifier"});
        expect(fetcher.mock.calls[1][0]).toBe("https://www.googleapis.com/oauth2/v3/certs");
    });

    it("signs Apple's client secret with the configured EC key and requests form_post", async () => {
        const {exchangeIdentity, authorizationUrl} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: idToken("apple")})).mockResolvedValueOnce(json({keys: [jwk]}));
        expect(await exchangeIdentity("apple", options, "code", "unused", "nonce")).toMatchObject({provider: "apple"});
        const body = new URLSearchParams(fetcher.mock.calls[0][1]!.body as string);
        expect(body.has("code_verifier")).toBe(false);
        const verified = verify(body.get("client_secret")!, appleKey.publicKey, {algorithms: ["ES256"], issuer: "team", audience: "https://appleid.apple.com", subject: "apple-client", complete: true});
        expect(verified.header.kid).toBe("apple-key");
        const payload = verified.payload as {iat: number; exp: number};
        expect(payload.exp - payload.iat).toBe(300);
        const url = new URL(authorizationUrl("apple", options, "state", "nonce", "unused"));
        expect(Object.fromEntries(url.searchParams)).toMatchObject({state: "state", nonce: "nonce", response_mode: "form_post", scope: "name email"});
        expect(url.searchParams.has("code_challenge")).toBe(false);
    });

    it.each([undefined, "x".repeat(16385)])("rejects a missing or oversized ID token", async value => {
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: value}));
        await expect(exchangeIdentity("google", options, "code", "verifier", "nonce")).rejects.toThrow("Missing identity token");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each(["malformed", sign({}, "secret", {algorithm: "HS256"}), sign({}, rsa.privateKey, {algorithm: "RS256"})])("rejects invalid token headers before fetching keys", async value => {
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: value}));
        await expect(exchangeIdentity("google", options, "code", "verifier", "nonce")).rejects.toThrow("Invalid identity token");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it("fails closed on provider HTTP errors", async () => {
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({error: "invalid_grant"}, 400));
        await expect(exchangeIdentity("google", options, "code", "verifier", "nonce")).rejects.toThrow("Identity provider request failed");
    });
    it("rejects malformed JWKS responses", async () => {
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: idToken()})).mockResolvedValueOnce(json({keys: "bad"}));
        await expect(exchangeIdentity("google", options, "code", "verifier", "nonce")).rejects.toThrow("Invalid signing keys");
    });
    it.each([{kid: "other"}, {kty: "EC"}, {alg: "HS256"}, {use: "enc"}])("rejects unsuitable signing keys %j", async change => {
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: idToken()})).mockResolvedValueOnce(json({keys: [{...jwk, ...change}]}));
        await expect(exchangeIdentity("google", options, "code", "verifier", "nonce")).rejects.toThrow("Unknown signing key");
    });
    it("refreshes keys on rotation and accepts optional JWKS alg/use fields", async () => {
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: idToken()})).mockResolvedValueOnce(json({keys: [jwk]}));
        await exchangeIdentity("google", options, "code", "verifier", "nonce");
        fetcher.mockResolvedValueOnce(json({id_token: idToken("google", "rotated")})).mockResolvedValueOnce(json({keys: [{...jwk, kid: "rotated", alg: undefined, use: undefined}]}));
        await expect(exchangeIdentity("google", options, "code", "verifier", "nonce")).resolves.toMatchObject({subject: "subject"});
        expect(fetcher).toHaveBeenCalledTimes(4);
    });
    it("refreshes expired key caches", async () => {
        vi.useFakeTimers();
        const {exchangeIdentity} = await import("./social-oidc");
        fetcher.mockResolvedValueOnce(json({id_token: idToken()})).mockResolvedValueOnce(json({keys: [jwk]}));
        await exchangeIdentity("google", options, "code", "verifier", "nonce");
        vi.setSystemTime(Date.now() + 3_600_001);
        fetcher.mockResolvedValueOnce(json({id_token: idToken()})).mockResolvedValueOnce(json({keys: [jwk]}));
        await exchangeIdentity("google", options, "code", "verifier", "nonce");
        expect(fetcher).toHaveBeenCalledTimes(4);
    });
});
