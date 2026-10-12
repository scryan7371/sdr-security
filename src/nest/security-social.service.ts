import {BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException} from "@nestjs/common";
import {createHash, randomBytes} from "node:crypto";
import {hash} from "bcryptjs";
import {and, eq, gt, lt, sql} from "drizzle-orm";
import {SECURITY_AUTH_OPTIONS} from "./security-auth.constants";
import {SecurityAuthModuleOptions} from "./security-auth.options";
import {SECURITY_DRIZZLE_DB, SecurityDatabase} from "./security-drizzle.module";
import {SecurityAuthService} from "./security-auth.service";
import {SecurityWorkflowsService} from "./security-workflows.service";
import {securityIdentity, securitySocialAttempt, securitySocialTicket, securityUser, user} from "../drizzle";
import {SocialIdentity, SocialProvider} from "./security-social.options";
import {authorizationUrl, exchangeIdentity} from "./social-oidc";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const challenge = (value: string) => createHash("sha256").update(value).digest("base64url");
const secret = () => randomBytes(32).toString("base64url");

@Injectable()
export class SecuritySocialService {
    constructor(
        @Inject(SECURITY_DRIZZLE_DB) private readonly db: SecurityDatabase,
        @Inject(SECURITY_AUTH_OPTIONS) private readonly options: SecurityAuthModuleOptions,
        private readonly auth: SecurityAuthService,
        private readonly workflows: SecurityWorkflowsService,
    ) {}

    providers(): SocialProvider[] {
        return (["google", "apple"] as const).filter(provider => !!this.options.social?.[provider]);
    }

    async signInMethod(userId: string) {
        const [account] = await this.db.select({method: securityUser.signInMethod}).from(securityUser).where(eq(securityUser.userId, userId));
        if (!account) throw new UnauthorizedException("User not found");
        return account;
    }

    async start(provider: unknown, returnUrl: unknown, appChallenge: unknown) {
        if ((provider !== "google" && provider !== "apple") || !this.providers().includes(provider)) {
            throw new BadRequestException("Sign-in provider is not configured");
        }
        if (typeof returnUrl !== "string" || !this.options.social!.allowedReturnUrls.includes(returnUrl) ||
            typeof appChallenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(appChallenge)) {
            throw new BadRequestException("Invalid sign-in request");
        }
        const target = new URL(returnUrl);
        if (target.hash || target.search || target.username || target.password ||
            (["javascript:", "data:", "file:"].includes(target.protocol) || !target.host) ||
            (target.protocol === "http:" && !["localhost", "127.0.0.1"].includes(target.hostname))) {
            throw new BadRequestException("Invalid return URL configuration");
        }
        await this.db.delete(securitySocialAttempt).where(lt(securitySocialAttempt.expiresAt, new Date()));
        await this.db.delete(securitySocialTicket).where(lt(securitySocialTicket.expiresAt, new Date()));
        const state = secret(), nonce = secret(), verifier = secret();
        await this.db.insert(securitySocialAttempt).values({
            stateHash: digest(state), provider, nonce, providerVerifier: verifier,
            appChallenge, returnUrl, expiresAt: new Date(Date.now() + 10 * 60_000),
        });
        return {authorizationUrl: authorizationUrl(provider, this.options.social!, state, nonce, challenge(verifier))};
    }

    async callback(provider: SocialProvider, params: {state?: unknown; code?: unknown; error?: unknown; user?: unknown}) {
        if (typeof params.state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(params.state)) {
            throw new BadRequestException("Invalid or expired sign-in. Please start again.");
        }
        const [attempt] = await this.db.delete(securitySocialAttempt).where(and(
            eq(securitySocialAttempt.stateHash, digest(params.state)),
            eq(securitySocialAttempt.provider, provider), gt(securitySocialAttempt.expiresAt, new Date()),
        )).returning();
        if (!attempt) throw new BadRequestException("Invalid or expired sign-in. Please start again.");
        let identity: SocialIdentity | undefined;
        let error: string | undefined;
        try {
            if (params.error || typeof params.code !== "string" || !params.code || params.code.length > 4096) {
                throw new Error("Authorization did not complete");
            }
            identity = await exchangeIdentity(provider, this.options.social!, params.code, attempt.providerVerifier, attempt.nonce);
            // Apple sends names only on the first consent. They are display data, never identity evidence.
            if (provider === "apple" && typeof params.user === "string" && params.user.length < 4096) {
                try {
                    const profile = JSON.parse(params.user) as {name?: {firstName?: unknown; lastName?: unknown}};
                    identity.firstName = typeof profile.name?.firstName === "string" ? profile.name.firstName.trim().slice(0, 256) : "";
                    identity.lastName = typeof profile.name?.lastName === "string" ? profile.name.lastName.trim().slice(0, 256) : "";
                } catch { /* Names are optional. */ }
            }
        } catch {
            error = params.error === "access_denied" ? "cancelled" : "provider_failed";
        }
        const ticket = secret();
        await this.db.insert(securitySocialTicket).values({
            ticketHash: digest(ticket), appChallenge: attempt.appChallenge,
            identity, error, expiresAt: new Date(Date.now() + 60_000),
        });
        const url = new URL(attempt.returnUrl);
        url.searchParams.set("social_ticket", ticket);
        return url.toString();
    }

    async finish(ticket: unknown, verifier: unknown) {
        if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(ticket) ||
            typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
            throw new BadRequestException("Invalid sign-in exchange");
        }
        // Consume only when the app proves possession; interception cannot burn another app's ticket.
        const [record] = await this.db.delete(securitySocialTicket).where(and(
            eq(securitySocialTicket.ticketHash, digest(ticket)),
            eq(securitySocialTicket.appChallenge, challenge(verifier)),
            gt(securitySocialTicket.expiresAt, new Date()),
        )).returning();
        if (!record) throw new UnauthorizedException("Sign-in expired. Please try again.");
        if (!record.identity || record.error) {
            throw new BadRequestException(record.error === "cancelled" ? "Sign-in was cancelled" : "Unable to verify your sign-in. Please try again.");
        }
        const identity = record.identity;
        const result = await this.db.transaction(async tx => {
            // Serialize identity and email registration, including across API instances.
            await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity.provider + ":" + identity.subject}, 0))`);
            await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity.email}, 0))`);
            const [existing] = await tx.select().from(securityIdentity).where(and(
                eq(securityIdentity.provider, identity.provider), eq(securityIdentity.subject, identity.subject),
            ));
            if (existing) {
                return {userId: existing.userId, created: false};
            }
            const [matchingEmail] = await tx.select().from(user).where(sql`lower(${user.email}) = ${identity.email}`);
            if (matchingEmail) {
                throw new ConflictException("An account already uses this email. Please use the sign-in method chosen when that account was created.");
            }
            const [created] = await tx.insert(user).values({email: identity.email, firstName: identity.firstName, lastName: identity.lastName}).returning();
            await tx.insert(securityUser).values({userId: created.id,
                // Social registrations never accept passwords.
                passwordHash: await hash(secret(), 12), signInMethod: identity.provider, emailVerifiedAt: new Date()});
            await tx.insert(securityIdentity).values({provider: identity.provider, subject: identity.subject, userId: created.id});
            return {userId: created.id, created: true};
        });
        if (result.created) await this.workflows.markEmailVerifiedAndNotifyAdmins(result.userId);
        const accountMethod = await this.signInMethod(result.userId);
        if (accountMethod.method !== identity.provider) throw new UnauthorizedException("Use the sign-in method chosen at signup");
        const [account] = await this.db.select().from(securityUser).where(eq(securityUser.userId, result.userId));
        if (account?.active && (this.options.requireAdminApproval ?? true) && !account.adminApprovedAt) {
            return {status: "pending_approval" as const};
        }
        return {status: "authenticated" as const, auth: await this.auth.loginVerifiedUser(result.userId)};
    }
}
