import {BadRequestException, UnauthorizedException} from "@nestjs/common";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {compare} from "bcryptjs";
import {sign} from "jsonwebtoken";
import {SecurityAuthService} from "./security-auth.service";
import {SecurityAuthModuleOptions} from "./security-auth.options";
import {
    passwordResetToken,
    refreshToken,
    securityRole,
    securityUser,
    securityUserRole,
    user,
} from "../drizzle";

vi.mock("bcryptjs", () => ({
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (plain: string, hashed: string) => hashed === `hashed:${plain}`,),
}));
vi.mock("crypto", () => ({
    randomBytes: vi.fn(() => ({toString: () => "token-bytes"})),
}));
vi.mock("jsonwebtoken", () => ({
    sign: vi.fn(() => "signed-access-token"),
}));
vi.mock("uuid", () => ({
    v7: vi.fn(() => "uuid-1"),
}));
const makeRepo = () => ({
    findOne: vi.fn(),
    save: vi.fn(async (value: any) => value),
    create: vi.fn((value: any) => value),
    update: vi.fn(async (_criteria: unknown, _value: unknown) => ({affected: 1})),
    find: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
});

type MockRepo = ReturnType<typeof makeRepo>;

const makeDb = (repos: {
    appUsersRepo: MockRepo;
    securityUsersRepo: MockRepo;
    refreshTokenRepo: MockRepo;
    passwordResetRepo: MockRepo;
    rolesRepo: MockRepo;
    userRolesRepo: MockRepo;
}) => {
    const lastRows = new Map<unknown, Array<Record<string, unknown>>>();
    const repoFor = (table: unknown) => {
        if (table === user) return repos.appUsersRepo;
        if (table === securityUser) return repos.securityUsersRepo;
        if (table === refreshToken) return repos.refreshTokenRepo;
        if (table === passwordResetToken) return repos.passwordResetRepo;
        if (table === securityRole) return repos.rolesRepo;
        if (table === securityUserRole) return repos.userRolesRepo;
        throw new Error("Unexpected table in Drizzle mock");
    };

    const readsMany = (table: unknown) =>
        table === refreshToken || table === securityRole || table === securityUserRole;

    return {
        select: vi.fn(() => ({
            from: vi.fn((table: unknown) => ({
                where: vi.fn(async () => {
                    const repo = repoFor(table);
                    if (readsMany(table)) {
                        const rows = await repo.find();
                        lastRows.set(table, rows);
                        return rows;
                    }
                    const row = await repo.findOne();
                    const rows = row ? [row] : [];
                    lastRows.set(table, rows);
                    return rows;
                }),
            })),
        })),
        insert: vi.fn((table: unknown) => ({
            values: vi.fn((value: unknown) => {
                const repo = repoFor(table);
                const saved = repo.save(repo.create(value));
                return {
                    returning: vi.fn(async () => [await saved]),
                    then: saved.then.bind(saved),
                };
            }),
        })),
        update: vi.fn((table: unknown) => ({
            set: vi.fn((value: unknown) => ({
                where: vi.fn(async () => {
                    const row = lastRows.get(table)?.[0];
                    const key = row?.id ? {id: row.id} : {};
                    return repoFor(table).update(key, value);
                }),
            })),
        })),
    };
};
const makeNotifier = () => ({
    sendEmailVerification: vi.fn(async () => undefined),
    sendPasswordReset: vi.fn(async () => undefined),
    sendAdminsUserEmailVerified: vi.fn(async () => undefined),
    sendUserAccountApproved: vi.fn(async () => undefined),
});
const makeUser = () => ({
    id: "user-1", email: "user@example.com",
});
const makeSecurityUser = () => ({
    userId: "user-1",
    passwordHash: "hashed:Secret123",
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    emailVerificationToken: null,
    adminApprovedAt: new Date("2026-01-01T00:00:00.000Z"),
    active: true,
});
const setup = (
    optionOverrides: Partial<SecurityAuthModuleOptions> = {},
    notifierOverrides: Partial<ReturnType<typeof makeNotifier>> = {},
) => {
    const appUsersRepo = makeRepo();
    const securityUsersRepo = makeRepo();
    const refreshTokenRepo = makeRepo();
    const passwordResetRepo = makeRepo();
    const rolesRepo = makeRepo();
    const userRolesRepo = makeRepo();
    const notifier = {...makeNotifier(), ...notifierOverrides};
    const db = makeDb({
        appUsersRepo,
        securityUsersRepo,
        refreshTokenRepo,
        passwordResetRepo,
        rolesRepo,
        userRolesRepo,
    });
    const workflowsService = {
        markEmailVerifiedAndNotifyAdmins: vi.fn(async () => ({success: true})),
    };
    const service = new SecurityAuthService(db as never, {
        jwtSecret: "secret",
        accessTokenExpiresIn: "15m",
        refreshTokenExpiresInDays: 30,
        requireEmailVerification: true,
        requireAdminApproval: true,
        passwordResetTokenExpiresInMinutes: 30,
        ...optionOverrides,
    }, notifier as never, workflowsService as never,);
    return {
        service,
        appUsersRepo,
        securityUsersRepo,
        refreshTokenRepo,
        passwordResetRepo,
        rolesRepo,
        userRolesRepo,
        notifier,
        workflowsService,
    };
};
describe("SecurityAuthService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("registers user and sends verification", async () => {
        const {
            service,
            appUsersRepo,
            securityUsersRepo,
            userRolesRepo,
            rolesRepo,
            notifier,
        } = setup();
        appUsersRepo.findOne.mockResolvedValue(null);
        appUsersRepo.save.mockResolvedValue(makeUser());
        securityUsersRepo.save.mockResolvedValue(makeSecurityUser());
        userRolesRepo.find.mockResolvedValue([]);
        rolesRepo.find.mockResolvedValue([]);
        const result = await service.register({
            email: "USER@example.com",
            password: "Secret123",
            firstName: "Taylor",
            lastName: "Jordan",
        });
        expect(result.success).toBe(true);
        expect(appUsersRepo.create).toHaveBeenCalledWith(expect.objectContaining({email: "user@example.com"}),);
        expect(notifier.sendEmailVerification).toHaveBeenCalled();
    });
    it("rejects duplicate email on register", async () => {
        const {service, appUsersRepo} = setup();
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        await expect(service.register({
            email: "user@example.com",
            password: "Secret123",
            firstName: "Taylor",
            lastName: "Jordan",
        }),).rejects.toBeInstanceOf(BadRequestException);
    });
    it("handles login success and auth failures", async () => {
        const {
            service,
            appUsersRepo,
            securityUsersRepo,
            userRolesRepo,
            rolesRepo,
            refreshTokenRepo,
        } = setup();
        const user = makeUser();
        appUsersRepo.findOne.mockResolvedValue(user);
        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());
        userRolesRepo.find.mockResolvedValue([{roleId: "r1"}]);
        rolesRepo.find.mockResolvedValue([{id: "r1", roleKey: "admin"}]);
        const auth = await service.login({
            email: user.email, password: "Secret123",
        });
        expect(auth.accessToken).toBe("signed-access-token");
        expect(sign).toHaveBeenCalled();
        expect(refreshTokenRepo.save).toHaveBeenCalled();
        appUsersRepo.findOne.mockResolvedValue(null);
        await expect(service.login({
            email: "none@example.com",
            password: "Secret123"
        }),).rejects.toBeInstanceOf(UnauthorizedException);
    });
    it("blocks login when account is inactive or missing approvals", async () => {
        const {service, appUsersRepo, securityUsersRepo} = setup();
        const inactive = {...makeSecurityUser(), active: false};
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        securityUsersRepo.findOne.mockResolvedValue(inactive);
        await expect(service.login({
            email: "x@example.com",
            password: "Secret123"
        }),).rejects.toThrow("Account is inactive");
        securityUsersRepo.findOne.mockResolvedValue({
            ...makeSecurityUser(), emailVerifiedAt: null,
        });
        await expect(service.login({
            email: "x@example.com",
            password: "Secret123"
        }),).rejects.toThrow("Email verification required");
        securityUsersRepo.findOne.mockResolvedValue({
            ...makeSecurityUser(), adminApprovedAt: null,
        });
        await expect(service.login({
            email: "x@example.com",
            password: "Secret123"
        }),).rejects.toThrow("Admin approval required");
    });
    it("refreshes and revokes tokens", async () => {
        const {
            service,
            appUsersRepo,
            securityUsersRepo,
            refreshTokenRepo,
            userRolesRepo,
            rolesRepo,
        } = setup();
        refreshTokenRepo.find.mockResolvedValue([{
            id: "rt1",
            userId: "user-1",
            tokenHash: "hashed:token-bytes",
            expiresAt: new Date(Date.now() + 60_000),
        },]);
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());
        userRolesRepo.find.mockResolvedValue([]);
        rolesRepo.find.mockResolvedValue([]);
        const result = await service.refreshAuthToken("token-bytes");
        expect(result.accessToken).toBe("signed-access-token");
        expect(refreshTokenRepo.update).toHaveBeenCalledWith({id: "rt1"}, expect.objectContaining({revokedAt: expect.any(Date)}),);
        await expect(service.logout()).resolves.toEqual({success: true});
        await expect(service.logout("token-bytes")).resolves.toEqual({
            success: true,
        });
    });
    it("rejects invalid refresh token and missing refresh user", async () => {
        const {service, refreshTokenRepo, appUsersRepo} = setup();
        refreshTokenRepo.find.mockResolvedValue([]);
        await expect(service.refreshAuthToken("bad-token")).rejects.toThrow("Invalid refresh token",);
        refreshTokenRepo.find.mockResolvedValue([{
            id: "rt1",
            userId: "missing",
            tokenHash: "hashed:token-bytes",
            expiresAt: new Date(Date.now() + 60_000),
        },]);
        appUsersRepo.findOne.mockResolvedValue(null);
        await expect(service.refreshAuthToken("token-bytes")).rejects.toThrow("User not found",);
    });
    it("changes password", async () => {
        const {service, securityUsersRepo} = setup();
        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());
        await expect(service.changePassword({
            userId: "user-1",
            currentPassword: "Secret123",
            newPassword: "NewPass1",
        }),).resolves.toEqual({success: true});
        securityUsersRepo.findOne.mockResolvedValue(null);
        await expect(service.changePassword({
            userId: "missing",
            currentPassword: "Secret123",
            newPassword: "NewPass1",
        }),).rejects.toThrow("User not found");
    });
    it("handles forgot/reset password flow", async () => {
        const {
            service,
            appUsersRepo,
            securityUsersRepo,
            passwordResetRepo,
            notifier,
        } = setup();
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());
        passwordResetRepo.findOne.mockResolvedValue({
            id: "pr1",
            userId: "user-1",
            token: "token-bytes",
            usedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
        });
        await expect(service.requestForgotPassword("user@example.com"),).resolves.toEqual({
            success: true,
        });
        expect(passwordResetRepo.save).toHaveBeenCalled();
        expect(notifier.sendPasswordReset).toHaveBeenCalled();
        await expect(service.resetPassword("token-bytes", "NewPass1"),).resolves.toEqual({
            success: true,
        });
    });
    it("returns success for unknown forgot email and rejects bad reset token", async () => {
        const {service, appUsersRepo, passwordResetRepo} = setup();
        appUsersRepo.findOne.mockResolvedValue(null);
        await expect(service.requestForgotPassword("none@example.com"),).resolves.toEqual({
            success: true,
        });
        passwordResetRepo.findOne.mockResolvedValue(null);
        await expect(service.resetPassword("bad", "x")).rejects.toThrow("Invalid password reset token",);
        passwordResetRepo.findOne.mockResolvedValue({
            id: "pr1",
            userId: "user-1",
            token: "bad",
            usedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
        });
        await expect(service.resetPassword("bad", "x")).rejects.toThrow("Invalid password reset token",);
    });
    it("verifies email token and reads user roles", async () => {
        const {service, securityUsersRepo, userRolesRepo, rolesRepo, workflowsService} = setup();
        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());
        userRolesRepo.find.mockResolvedValue([{roleId: "r1"}]);
        rolesRepo.find.mockResolvedValue([{id: "r1", roleKey: "coach"}]);
        await expect(service.verifyEmailByToken("token-bytes")).resolves.toEqual({
            success: true,
        });
        expect(workflowsService.markEmailVerifiedAndNotifyAdmins).toHaveBeenCalledWith("user-1");
        await expect(service.getMyRoles("user-1")).resolves.toEqual({
            userId: "user-1", roles: ["COACH"],
        });
    });
    it("rejects invalid email verification token", async () => {
        const {service, securityUsersRepo} = setup();
        securityUsersRepo.findOne.mockResolvedValue(null);
        await expect(service.verifyEmailByToken("missing")).rejects.toThrow("Invalid verification token",);
    });
    it("handles refresh with expired matching token", async () => {
        const {service, refreshTokenRepo} = setup();
        refreshTokenRepo.find.mockResolvedValue([{
            id: "rt1",
            userId: "user-1",
            tokenHash: "hashed:token-bytes",
            expiresAt: new Date(Date.now() - 1),
        },]);
        await expect(service.refreshAuthToken("token-bytes")).rejects.toThrow("Invalid refresh token",);
        expect(compare).toHaveBeenCalled();
    });
    it("rejects login when security state is missing or the password is wrong", async () => {
        const {service, appUsersRepo, securityUsersRepo} = setup();
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        securityUsersRepo.findOne.mockResolvedValue(null);

        await expect(service.login({
            email: "user@example.com",
            password: "Secret123",
        })).rejects.toThrow("Invalid credentials");

        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());
        await expect(service.login({
            email: "user@example.com",
            password: "wrong",
        })).rejects.toThrow("Invalid credentials");
    });
    it("rejects refresh when the user's security state is missing", async () => {
        const {service, refreshTokenRepo, appUsersRepo, securityUsersRepo} = setup();
        refreshTokenRepo.find.mockResolvedValue([{
            id: "rt1",
            userId: "user-1",
            tokenHash: "hashed:token-bytes",
            expiresAt: new Date(Date.now() + 60_000),
        }]);
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        securityUsersRepo.findOne.mockResolvedValue(null);

        await expect(service.refreshAuthToken("token-bytes")).rejects.toThrow(
            "User not found",
        );
    });
    it("rejects a wrong current password", async () => {
        const {service, securityUsersRepo} = setup();
        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());

        await expect(service.changePassword({
            userId: "user-1",
            currentPassword: "wrong",
            newPassword: "NewPass1",
        })).rejects.toThrow("Current password is incorrect");
    });
    it("does not disclose users without security state in forgot password", async () => {
        const {service, appUsersRepo, securityUsersRepo, notifier} = setup();
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        securityUsersRepo.findOne.mockResolvedValue(null);

        await expect(service.requestForgotPassword("user@example.com")).resolves.toEqual({
            success: true,
        });
        expect(notifier.sendPasswordReset).not.toHaveBeenCalled();
    });
    it("rejects an expired password reset token", async () => {
        const {service, passwordResetRepo} = setup();
        passwordResetRepo.findOne.mockResolvedValue({
            id: "pr1",
            userId: "user-1",
            usedAt: null,
            expiresAt: new Date(Date.now() - 1),
        });

        await expect(service.resetPassword("expired", "NewPass1")).rejects.toThrow(
            "Invalid password reset token",
        );
    });
    it("gets a user id from a verification token or returns null", async () => {
        const {service, securityUsersRepo} = setup();
        securityUsersRepo.findOne.mockResolvedValue(makeSecurityUser());
        await expect(service.getUserIdByVerificationToken("valid")).resolves.toBe(
            "user-1",
        );

        securityUsersRepo.findOne.mockResolvedValue(null);
        await expect(service.getUserIdByVerificationToken("missing")).resolves.toBeNull();
    });
    it("skips nonmatching and already revoked refresh tokens during logout", async () => {
        const {service, refreshTokenRepo} = setup();
        refreshTokenRepo.find.mockResolvedValue([
            {
                id: "rt-other",
                tokenHash: "hashed:other",
                expiresAt: new Date(Date.now() + 60_000),
            },
            {
                id: "rt-revoked",
                tokenHash: "hashed:token-bytes",
                expiresAt: new Date(Date.now() + 60_000),
                revokedAt: new Date(),
            },
        ]);

        await expect(service.logout("token-bytes")).resolves.toEqual({success: true});
        expect(refreshTokenRepo.update).not.toHaveBeenCalled();
    });
    it("supports optional notifications, relaxed approval checks, and defaults", async () => {
        const {service, appUsersRepo, securityUsersRepo, userRolesRepo, rolesRepo} = setup(
            {
                accessTokenExpiresIn: undefined,
                refreshTokenExpiresInDays: undefined,
                passwordResetTokenExpiresInMinutes: undefined,
                requireEmailVerification: false,
                requireAdminApproval: false,
            },
            {
                sendEmailVerification: undefined,
                sendPasswordReset: undefined,
            },
        );
        appUsersRepo.findOne.mockResolvedValue(makeUser());
        securityUsersRepo.findOne.mockResolvedValue({
            ...makeSecurityUser(),
            emailVerifiedAt: null,
            adminApprovedAt: null,
        });
        userRolesRepo.find.mockResolvedValue([]);
        rolesRepo.find.mockResolvedValue([]);

        const auth = await service.login({
            email: "user@example.com",
            password: "Secret123",
        });
        expect(auth.accessTokenExpiresIn).toBe("15m");

        await expect(service.requestForgotPassword("user@example.com")).resolves.toEqual({
            success: true,
        });
    });
});
