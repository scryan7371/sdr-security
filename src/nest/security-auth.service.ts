import {
    BadRequestException, Inject, Injectable, UnauthorizedException,
} from "@nestjs/common";
import {randomBytes} from "crypto";
import {compare, hash} from "bcryptjs";
import {sign, type SignOptions} from "jsonwebtoken";
import {uuidv7} from "./uuid-v7";
import {SecurityAuthModuleOptions} from "./security-auth.options";
import {SECURITY_AUTH_OPTIONS} from "./security-auth.constants";
import {SECURITY_WORKFLOW_NOTIFIER} from "./tokens";
import {SecurityWorkflowNotifier} from "./contracts";
import {SECURITY_DRIZZLE_DB, SecurityDatabase} from "./security-drizzle.module";
import {
    passwordResetToken,
    refreshToken,
    securityRole,
    securityUser,
    securityUserRole,
    user
} from "../drizzle";
import {eq, inArray, isNull} from "drizzle-orm";
import {
    AuthResponse, normalizeRoleName, RegisterResponse, SafeUser, sanitizeEmail
} from "../api";

const EMAIL_TOKEN_BYTES = 24;
const REFRESH_TOKEN_BYTES = 32;
const PASSWORD_ROUNDS = 12;

@Injectable()
export class SecurityAuthService {
    constructor(@Inject(SECURITY_DRIZZLE_DB) private readonly db: SecurityDatabase, @Inject(SECURITY_AUTH_OPTIONS) private readonly options: SecurityAuthModuleOptions, @Inject(SECURITY_WORKFLOW_NOTIFIER) private readonly notifier: SecurityWorkflowNotifier,) {
    }

    async register(params: {
        email: string; password: string;
    }): Promise<RegisterResponse> {
        const email = sanitizeEmail(params.email);
        const existing = await this.db.select().from(user).where(eq(user.email, email))
        if (existing.length > 0) {
            throw new BadRequestException("Email already in use");
        }
        const appUser = await this.db.insert(user).values({email: email}).returning()
        await this.db.insert(securityUser).values({
            userId: appUser[0].id,
            passwordHash: await hash(params.password, PASSWORD_ROUNDS),
        });
        const verificationToken = await this.createEmailVerificationToken(appUser[0].id,);
        if (this.notifier.sendEmailVerification) {
            await this.notifier.sendEmailVerification({
                email: appUser[0].email, token: verificationToken,
            });
        }
        return {
            success: true, user: {
                id: appUser[0].id,
                email: appUser[0].email,
                roles: await this.getUserRoleKeys(appUser[0].id)
            }, debugToken: verificationToken,
        };
    }

    async login(params: {
        email: string; password: string;
    }): Promise<AuthResponse> {
        const email = sanitizeEmail(params.email);
        const appUser = await this.db.select().from(user).where(eq(user.email, email));
        if (appUser.length === 0) {
            throw new UnauthorizedException("Invalid credentials");
        }
        const theSecurityUser = await this.db.select().from(securityUser).where(eq(securityUser.userId, appUser[0].id))
        if (theSecurityUser.length === 0) {
            throw new UnauthorizedException("Invalid credentials");
        }
        const ok = await compare(params.password, theSecurityUser[0].passwordHash);
        if (!ok) {
            throw new UnauthorizedException("Invalid credentials");
        }
        this.assertCanAuthenticate(theSecurityUser[0].active, theSecurityUser[0].emailVerifiedAt, theSecurityUser[0].adminApprovedAt);
        return this.issueTokens(appUser[0].id, appUser[0].email);
    }

    async refreshAuthToken(theRefreshToken: string): Promise<AuthResponse> {
        const record = await this.findValidRefreshToken(theRefreshToken);
        if (!record) {
            throw new UnauthorizedException("Invalid refresh token");
        }
        await this.db.update(refreshToken).set({revokedAt: new Date()}).where(eq(refreshToken.id, record.id));
        const appUser = await this.db.select().from(user).where(eq(user.id, record.userId))
        if (appUser.length === 0) {
            throw new UnauthorizedException("User not found");
        }
        const theSecurityUser = await this.db.select().from(securityUser).where(eq(securityUser.userId, appUser[0].id))
        if (theSecurityUser.length === 0) {
            throw new UnauthorizedException("User not found");
        }
        this.assertCanAuthenticate(theSecurityUser[0].active, theSecurityUser[0].emailVerifiedAt, theSecurityUser[0].adminApprovedAt,);
        return this.issueTokens(appUser[0].id, appUser[0].email);
    }

    async logout(refreshTokenValue?: string) {
        if (!refreshTokenValue) {
            return {success: true as const};
        }
        const record = await this.findValidRefreshToken(refreshTokenValue, false);
        if (record && !record.revokedAt) {
            await this.db.update(refreshToken).set({revokedAt: new Date()}).where(eq(refreshToken.id, record.id));
        }
        return {success: true as const};
    }

    async changePassword(params: {
        userId: string; currentPassword: string; newPassword: string;
    }) {
        const theSecurityUser = await this.db.select().from(securityUser).where(eq(securityUser.userId, params.userId))
        if (theSecurityUser.length === 0) {
            throw new BadRequestException("User not found");
        }
        const ok = await compare(params.currentPassword, theSecurityUser[0].passwordHash);
        if (!ok) {
            throw new UnauthorizedException("Current password is incorrect");
        }
        await this.db.update(securityUser).set({passwordHash: await hash(params.newPassword, PASSWORD_ROUNDS)}).where(eq(securityUser.userId, theSecurityUser[0].userId));
        return {success: true as const};
    }

    async requestForgotPassword(emailInput: string) {
        const email = sanitizeEmail(emailInput);
        const appUser = await this.db.select().from(user).where(eq(user.email, email));
        if (appUser.length === 0) {
            return {success: true as const};
        }
        const theSecurityUser = await this.db.select().from(securityUser).where(eq(securityUser.userId, appUser[0].id))
        if (theSecurityUser.length === 0) {
            return {success: true as const};
        }
        const token = randomBytes(EMAIL_TOKEN_BYTES).toString("hex");
        const expiresAt = new Date(Date.now() + (this.options.passwordResetTokenExpiresInMinutes ?? 30) * 60_000,);
        await this.db.insert(passwordResetToken).values({
            id: uuidv7(),
            userId: appUser[0].id,
            token: token,
            expiresAt: expiresAt
        })
        if (this.notifier.sendPasswordReset) {
            await this.notifier.sendPasswordReset({
                email: appUser[0].email, token
            });
        }
        return {success: true as const};
    }

    async resetPassword(token: string, newPassword: string) {
        const reset = await this.db.select().from(passwordResetToken).where(eq(passwordResetToken.token, token));
        if (reset.length === 0 || reset[0].usedAt || reset[0].expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException("Invalid password reset token");
        }
        await this.db.update(securityUser).set({passwordHash: await hash(newPassword, PASSWORD_ROUNDS)}).where(eq(securityUser.userId, reset[0].userId));
        await this.db.update(passwordResetToken).set({usedAt: new Date()}).where(eq(passwordResetToken.id, reset[0].id))
        return {success: true as const};
    }

    async verifyEmailByToken(token: string) {
        const user = await this.db.select().from(securityUser).where(eq(securityUser.emailVerificationToken, token));
        if (user.length === 0) {
            throw new BadRequestException("Invalid verification token");
        }
        await this.db.update(securityUser).set({
            emailVerifiedAt: new Date(), emailVerificationToken: null
        }).where(eq(securityUser.userId, user[0].userId));
        return {success: true as const};
    }

    async getMyRoles(userId: string) {
        return {userId, roles: await this.getUserRoleKeys(userId)};
    }

    async getUserIdByVerificationToken(token: string): Promise<string | null> {
        const user = await this.db.select().from(securityUser).where(eq(securityUser.emailVerificationToken, token));
        return user[0]?.userId ?? null;
    }

    private assertCanAuthenticate(isActive: boolean, emailVerifiedAt: Date | null, adminApprovedAt: Date | null) {
        if (!isActive) {
            throw new UnauthorizedException("Account is inactive");
        }
        if ((this.options.requireEmailVerification ?? true) && !emailVerifiedAt) {
            throw new UnauthorizedException("Email verification required");
        }
        if ((this.options.requireAdminApproval ?? true) && !adminApprovedAt) {
            throw new UnauthorizedException("Admin approval required");
        }
    }

    private async issueTokens(userId: string, userEmail: string,): Promise<AuthResponse> {
        const roles = await this.getUserRoleKeys(userId);
        const accessTokenExpiresIn = this.options.accessTokenExpiresIn ?? "15m";
        const accessToken = sign({
            sub: userId, email: userEmail, roles
        }, this.options.jwtSecret, {expiresIn: accessTokenExpiresIn as SignOptions["expiresIn"]},);
        const refreshTokenValue = randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
        const refreshTokenHash = await hash(refreshTokenValue, PASSWORD_ROUNDS);
        const refreshTokenExpiresAt = new Date(Date.now() + (this.options.refreshTokenExpiresInDays ?? 30) * 24 * 60 * 60 * 1000,);
        await this.db.insert(refreshToken).values({
            id: uuidv7(),
            userId: userId,
            tokenHash: refreshTokenHash,
            expiresAt: refreshTokenExpiresAt,
        });
        const theUser = await this.db.select({
            id: user.id, email: user.email
        }).from(user).where(eq(user.id, userId));
        const safeUser = {
            id: theUser[0].id, email: theUser[0].email, roles: roles
        } as SafeUser
        return {
            accessToken,
            accessTokenExpiresIn,
            refreshToken: refreshTokenValue,
            refreshTokenExpiresAt,
            userId: userId,
            user: safeUser
        };
    }

    private async createEmailVerificationToken(userId: string) {
        const token = randomBytes(EMAIL_TOKEN_BYTES).toString("hex");
        await this.db.update(securityUser).set({emailVerificationToken: token}).where(eq(securityUser.userId, userId));
        return token;
    }

    private async findValidRefreshToken(token: string, onlyUnexpired = true) {
        const candidates = await this.db.select().from(refreshToken).where(isNull(refreshToken.revokedAt))
        // tODO Order by
        for (const candidate of candidates) {
            const match = await compare(token, candidate.tokenHash);
            if (!match) {
                continue;
            }
            if (onlyUnexpired && candidate.expiresAt.getTime() <= Date.now()) {
                return null;
            }
            return candidate;
        }
        return null;
    }

    private async getUserRoleKeys(userId: string) {
        const assignments = await this.db.select().from(securityUserRole).where(eq(securityUserRole.userId, userId));
        if (assignments.length === 0) {
            return [] as string[];
        }
        const roleIds = assignments.map((assignment) => assignment.roleId);
        const roles = await this.db.select().from(securityRole).where(inArray(securityRole.id, roleIds));
        return roles.map((role) => normalizeRoleName(role.roleKey)).sort();
    }
}
