import {generateKeyPairSync} from "node:crypto";
import {sign} from "jsonwebtoken";
import {describe, expect, it} from "vitest";
import {authorizationUrl, validateIdentityToken} from "./social-oidc";

const {privateKey, publicKey} = generateKeyPairSync("rsa", {modulusLength: 2048});
const key = publicKey.export({format: "jwk"});
const claims = {
    sub: "provider-subject", email: "Cook@Example.com", email_verified: true,
    nonce: "expected-nonce", given_name: "Test", family_name: "User",
};
const token = (changes = {}, options = {}) => sign({...claims, ...changes}, privateKey, {
    algorithm: "RS256", issuer: "https://accounts.google.com", audience: "google-client",
    expiresIn: "5m", ...options,
});
const validate = (value: string) => validateIdentityToken(value, key, "google", "google-client", "expected-nonce");

describe("social identity cryptographic verification", () => {
    it("accepts a signed identity with verified email and the correct nonce", () => {
        expect(validate(token())).toEqual({provider: "google", subject: "provider-subject", email: "cook@example.com", firstName: "Test", lastName: "User"});
    });
    it.each([
        [{nonce: "other"}, {}], [{email_verified: false}, {}], [{email_verified: "false"}, {}],
        [{email: undefined}, {}], [{sub: ""}, {}], [{azp: "attacker"}, {}],
        [{}, {issuer: "https://attacker.example"}], [{}, {audience: "other-client"}],
        [{}, {expiresIn: -30}], [{iat: Math.floor(Date.now() / 1000) + 300}, {}],
    ])("rejects invalid claims %#", (changes, options) => expect(() => validate(token(changes, options))).toThrow());
    it("requires expiry", () => {
        const value = sign(claims, privateKey, {algorithm: "RS256", issuer: "https://accounts.google.com", audience: "google-client"});
        expect(() => validate(value)).toThrow();
    });
    it("rejects an invalid signature", () => {
        const other = generateKeyPairSync("rsa", {modulusLength: 2048});
        expect(() => validateIdentityToken(token(), other.publicKey.export({format: "jwk"}), "google", "google-client", "expected-nonce")).toThrow();
    });
    it("rejects algorithm substitution", () => {
        expect(() => validate(sign(claims, "attacker", {algorithm: "HS256"}))).toThrow();
    });
    it("accepts Apple's string verification claim and optional names", () => {
        const value = token({email_verified: "true", given_name: undefined, family_name: undefined}, {issuer: "https://appleid.apple.com", audience: "apple-client"});
        expect(validateIdentityToken(value, key, "apple", "apple-client", "expected-nonce")).toMatchObject({provider: "apple", firstName: "", lastName: ""});
    });
    it("binds Google authorization to state, nonce and S256 PKCE", () => {
        const url = new URL(authorizationUrl("google", {allowedReturnUrls: [], google: {clientId: "client", clientSecret: "secret", callbackUrl: "https://api.example/google"}}, "state", "nonce", "challenge"));
        expect(url.origin).toBe("https://accounts.google.com");
        expect(Object.fromEntries(url.searchParams)).toMatchObject({state: "state", nonce: "nonce", code_challenge: "challenge", code_challenge_method: "S256", response_type: "code"});
        expect(url.toString()).not.toContain("secret");
    });
});
