import {createPublicKey, type webcrypto} from "node:crypto";
import {decode, sign, verify, type JwtPayload} from "jsonwebtoken";
import type {SocialAuthOptions, SocialIdentity, SocialProvider} from "./security-social.options";

const endpoints = {
    google: {
        authorize: "https://accounts.google.com/o/oauth2/v2/auth",
        token: "https://oauth2.googleapis.com/token",
        jwks: "https://www.googleapis.com/oauth2/v3/certs",
        issuer: ["https://accounts.google.com", "accounts.google.com"],
    },
    apple: {
        authorize: "https://appleid.apple.com/auth/authorize",
        token: "https://appleid.apple.com/auth/token",
        jwks: "https://appleid.apple.com/auth/keys",
        issuer: ["https://appleid.apple.com"],
    },
};

type SigningKey = webcrypto.JsonWebKey & {kid?: string; alg?: string; use?: string};
const keyCache = new Map<SocialProvider, {expires: number; keys: SigningKey[]}>();

async function readJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(url, {...init, redirect: "error", signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error("Identity provider request failed");
    return await response.json() as Record<string, unknown>;
}

export function authorizationUrl(provider: SocialProvider, config: SocialAuthOptions, state: string, nonce: string, challenge: string) {
    const settings = config[provider]!;
    const url = new URL(endpoints[provider].authorize);
    url.search = new URLSearchParams({
        client_id: settings.clientId, redirect_uri: settings.callbackUrl,
        response_type: "code", scope: provider === "google" ? "openid email profile" : "name email",
        state, nonce,
        ...(provider === "google" ? {code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account"} : {response_mode: "form_post"}),
    }).toString();
    return url.toString();
}

export function validateIdentityToken(token: string, key: SigningKey, provider: SocialProvider, audience: string, nonce: string): SocialIdentity {
    const payload = verify(token, createPublicKey({key, format: "jwk"}), {
        algorithms: ["RS256"], issuer: endpoints[provider].issuer as [string, ...string[]], audience,
        clockTolerance: 5,
    }) as JwtPayload;
    if (!payload || typeof payload.exp !== "number" || typeof payload.iat !== "number" ||
        payload.iat > Date.now() / 1000 + 5 || payload.nonce !== nonce ||
        typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 256 ||
        typeof payload.email !== "string" || payload.email.length > 256 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
        !(payload.email_verified === true || payload.email_verified === "true") ||
        (payload.azp !== undefined && payload.azp !== audience)) {
        throw new Error("Invalid identity claims");
    }
    return {
        provider, subject: payload.sub, email: payload.email.trim().toLowerCase(),
        firstName: typeof payload.given_name === "string" ? payload.given_name.slice(0, 256) : "",
        lastName: typeof payload.family_name === "string" ? payload.family_name.slice(0, 256) : "",
    };
}

export async function exchangeIdentity(provider: SocialProvider, config: SocialAuthOptions, code: string, verifier: string, nonce: string) {
    const settings = config[provider]!;
    const apple = config.apple;
    const clientSecret = provider === "google" ? config.google!.clientSecret : sign({}, apple!.privateKey, {
        algorithm: "ES256", keyid: apple!.keyId, issuer: apple!.teamId,
        audience: "https://appleid.apple.com", subject: apple!.clientId, expiresIn: "5m",
    });
    const data = await readJson(endpoints[provider].token, {
        method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({grant_type: "authorization_code", code, client_id: settings.clientId,
            client_secret: clientSecret, redirect_uri: settings.callbackUrl,
            ...(provider === "google" ? {code_verifier: verifier} : {})}).toString(),
    });
    if (typeof data.id_token !== "string" || data.id_token.length > 16384) throw new Error("Missing identity token");
    const decoded = decode(data.id_token, {complete: true});
    if (!decoded || decoded.header.alg !== "RS256" || !decoded.header.kid) throw new Error("Invalid identity token");
    let cached = keyCache.get(provider);
    if (!cached || cached.expires < Date.now() || !cached.keys.some(key => key.kid === decoded.header.kid)) {
        const jwks = await readJson(endpoints[provider].jwks);
        if (!Array.isArray(jwks.keys)) throw new Error("Invalid signing keys");
        cached = {keys: jwks.keys as SigningKey[], expires: Date.now() + 3_600_000};
        keyCache.set(provider, cached);
    }
    const key = cached.keys.find(key => key.kid === decoded.header.kid && key.kty === "RSA" &&
        (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
    if (!key) throw new Error("Unknown signing key");
    return validateIdentityToken(data.id_token, key, provider, settings.clientId, nonce);
}
