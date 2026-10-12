import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {parse} from "dotenv";
import {readFileSync, readdirSync} from "node:fs";
import {createHash, randomBytes} from "node:crypto";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {eq} from "drizzle-orm";
import {verify} from "jsonwebtoken";
import * as schema from "../drizzle/runtime-schema";
import {SecurityAuthService} from "../nest/security-auth.service";
import {SecuritySocialService} from "../nest/security-social.service";
import {SecurityWorkflowsService} from "../nest/security-workflows.service";
import type {SecurityAuthModuleOptions} from "../nest/security-auth.options";
import type {SecurityDatabase} from "../nest/security-drizzle.module";

// Real PostgreSQL and crypto. This suite tests persistence/exchange, not provider consent.
const env = parse(readFileSync(process.env.SECURITY_TEST_ENV_FILE ?? ".env.test"));
if (!env.DB_NAME?.endsWith("_test") || !["localhost", "127.0.0.1"].includes(env.DB_HOST)) throw new Error("Social DB tests require a local *_test database");
const namespace = `social_it_${randomBytes(8).toString("hex")}`;
const pool = new Pool({host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, options: `-c search_path=${namespace}`, max: 4});
const db = drizzle(pool, {schema, casing: "snake_case"}) as SecurityDatabase;
const options: SecurityAuthModuleOptions = {jwtSecret: "integration-test-secret", requireAdminApproval: true, social: {
    allowedReturnUrls: ["https://app.example/", "joinourplans://oauth"],
    google: {clientId: "test-client", clientSecret: "not-a-real-credential", callbackUrl: "https://api.example/callback"},
}};
const notifier = {sendAdminsUserEmailVerified: async () => undefined, sendUserAccountApproved: async () => undefined};
const workflows = new SecurityWorkflowsService(db, notifier);
const auth = new SecurityAuthService(db, options, notifier, workflows);
const social = new SecuritySocialService(db, options, auth, workflows);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const challenge = (value: string) => createHash("sha256").update(value).digest("base64url");
const identity = {provider: "google" as const, subject: "google-subject", email: "social@example.com", firstName: "Social", lastName: "User"};
async function ticket(overrides: Partial<typeof schema.securitySocialTicket.$inferInsert> = {}) {
    const value = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
    await db.insert(schema.securitySocialTicket).values({ticketHash: digest(value), appChallenge: challenge(verifier), identity, expiresAt: new Date(Date.now() + 60_000), ...overrides});
    return {value, verifier};
}

beforeAll(async () => {
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query('CREATE TABLE users (id uuid PRIMARY KEY, email varchar(256) UNIQUE NOT NULL, first_name varchar(256) NOT NULL, last_name varchar(256) NOT NULL)');
    for (const file of readdirSync("drizzle").filter(file => file.endsWith(".sql")).sort()) {
        // Only the isolated schema differs from the shipped migration SQL.
        await pool.query(readFileSync(`drizzle/${file}`, "utf8").replaceAll('"public".', `"${namespace}".`));
    }
});
afterAll(async () => { await pool.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`); await pool.end(); });

describe("real database social sign-in", () => {
    let userId: string;
    it("rejects unconfigured providers, unsafe redirects and invalid challenges", async () => {
        await expect(social.start("apple", "https://app.example/", "a".repeat(43))).rejects.toThrow("not configured");
        await expect(social.start("google", "https://attacker.example/", "a".repeat(43))).rejects.toThrow("Invalid");
        await expect(social.start("google", "https://app.example/", "short")).rejects.toThrow("Invalid");
    });
    it("stores state without exposing raw state, consumes callback once and safely returns cancellation", async () => {
        const verifier = "x".repeat(43);
        const start = await social.start("google", "https://app.example/", challenge(verifier));
        const state = new URL(start.authorizationUrl).searchParams.get("state")!;
        const rows = await db.select().from(schema.securitySocialAttempt);
        expect(rows.some(row => row.stateHash === digest(state))).toBe(true);
        const result = await social.callback("google", {state, error: "access_denied"});
        expect(result.startsWith("https://app.example/?social_ticket=")).toBe(true);
        await expect(social.callback("google", {state, error: "access_denied"})).rejects.toThrow("expired");
        await expect(social.finish(new URL(result).searchParams.get("social_ticket"), verifier)).rejects.toThrow("cancelled");
    });
    it("creates a verified account without a password form but still requires approval", async () => {
        const t = await ticket();
        await expect(social.finish(t.value, t.verifier)).resolves.toEqual({status: "pending_approval"});
        const [account] = await db.select().from(schema.user).where(eq(schema.user.email, identity.email));
        userId = account.id;
        const [security] = await db.select().from(schema.securityUser).where(eq(schema.securityUser.userId, userId));
        expect(security.emailVerifiedAt).toBeInstanceOf(Date);
        expect(security.adminApprovedAt).toBeNull();
        expect(await social.signInMethod(userId)).toEqual({method: "google"});
        await expect(social.finish(t.value, t.verifier)).rejects.toThrow("expired");
    });
    it("requires PKCE possession and issues valid local tokens after approval, once only", async () => {
        await db.update(schema.securityUser).set({adminApprovedAt: new Date()}).where(eq(schema.securityUser.userId, userId));
        const t = await ticket();
        await expect(social.finish(t.value, "z".repeat(43))).rejects.toThrow("expired");
        const result = await social.finish(t.value, t.verifier);
        expect(result.status).toBe("authenticated");
        if (result.status !== "authenticated") throw new Error("Expected authentication");
        expect(verify(result.auth.accessToken, options.jwtSecret)).toMatchObject({sub: userId, email: identity.email});
        expect((await auth.refreshAuthToken(result.auth.refreshToken)).userId).toBe(userId);
        await expect(social.finish(t.value, t.verifier)).rejects.toThrow("expired");
    });
    it("does not attach a second identity just because its email matches", async () => {
        const t = await ticket({identity: {...identity, subject: "different-subject"}});
        await expect(social.finish(t.value, t.verifier)).rejects.toThrow("sign-in method chosen");
    });
    it("does not allow password login, password changes or password reset for Google accounts", async () => {
        await expect(auth.login({email: identity.email, password: "anything"})).rejects.toThrow("sign-in method");
        await expect(auth.changePassword({userId, currentPassword: "anything", newPassword: "new-password"})).rejects.toThrow("unavailable");
        await auth.requestForgotPassword(identity.email);
        expect(await db.select().from(schema.passwordResetToken).where(eq(schema.passwordResetToken.userId, userId))).toEqual([]);
        await db.insert(schema.passwordResetToken).values({id: randomBytes(16).toString("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"), userId, token: "old-reset", expiresAt: new Date(Date.now() + 60000)});
        await expect(auth.resetPassword("old-reset", "New-password1")).rejects.toThrow("unavailable");
    });
    it("rejects a second provider for an existing email", async () => {
        const t = await ticket({identity: {...identity, provider: "apple", subject: "apple-subject"}});
        await expect(social.finish(t.value, t.verifier)).rejects.toThrow("sign-in method chosen");
        expect(await social.signInMethod(userId)).toEqual({method: "google"});
    });
    it("creates Apple-only accounts, including private relay email addresses", async () => {
        const apple = {...identity, provider: "apple" as const, subject: "new-apple", email: "hidden@privaterelay.appleid.com", firstName: "", lastName: ""};
        const t = await ticket({identity: apple});
        expect(await social.finish(t.value, t.verifier)).toEqual({status: "pending_approval"});
        const [account] = await db.select().from(schema.user).where(eq(schema.user.email, apple.email));
        expect(await social.signInMethod(account.id)).toEqual({method: "apple"});
        await expect(auth.register({email: apple.email, firstName: "Other", lastName: "User", password: "New-password1"})).rejects.toThrow("Email already in use");
    });
    it("keeps password registration as password-only and rejects social signup for that email", async () => {
        const account = await auth.register({email: "Password@Example.com", firstName: "Password", lastName: "User", password: "Original-password1"});
        expect(await social.signInMethod(account.user.id)).toEqual({method: "password"});
        const t = await ticket({identity: {...identity, subject: "password-attempt", email: "password@example.com"}});
        await expect(social.finish(t.value, t.verifier)).rejects.toThrow("sign-in method chosen");
        await expect(auth.login({email: "password@example.com", password: "Original-password1"})).rejects.toThrow("Email verification required");
        await workflows.markEmailVerifiedAndNotifyAdmins(account.user.id);
        await workflows.setAdminApprovalAndNotifyUser(account.user.id, true);
        expect((await auth.login({email: "password@example.com", password: "Original-password1"})).userId).toBe(account.user.id);
    });
    it("rejects expired tickets and inactive accounts", async () => {
        const expired = await ticket({expiresAt: new Date(Date.now() - 1000)});
        await expect(social.finish(expired.value, expired.verifier)).rejects.toThrow("expired");
        await db.update(schema.securityUser).set({active: false}).where(eq(schema.securityUser.userId, userId));
        const t = await ticket();
        await expect(social.finish(t.value, t.verifier)).rejects.toThrow("inactive");
    });
    it("cascades identity deletion with account deletion", async () => {
        await db.delete(schema.user).where(eq(schema.user.id, userId));
        expect(await db.select().from(schema.securityIdentity).where(eq(schema.securityIdentity.userId, userId))).toEqual([]);
    });
});
