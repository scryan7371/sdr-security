import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { compare, hash } from "bcryptjs";
import { sign, type SignOptions } from "jsonwebtoken";
import { v7 as uuidv7 } from "uuid";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { AuthResponse, RegisterResponse } from "../api/contracts";
import { normalizeRoleName } from "../api/roles";
import { sanitizeEmail } from "../api/validation";
import { SecurityAuthModuleOptions } from "./security-auth.options";
import { SECURITY_AUTH_OPTIONS } from "./security-auth.constants";
import { AppUserEntity } from "./entities/app-user.entity";
import { PasswordResetTokenEntity } from "./entities/password-reset-token.entity";
import { RefreshTokenEntity } from "./entities/refresh-token.entity";
import { SecurityRoleEntity } from "./entities/security-role.entity";
import { SecurityUserEntity } from "./entities/security-user.entity";
import { SecurityUserRoleEntity } from "./entities/security-user-role.entity";
import { SECURITY_WORKFLOW_NOTIFIER } from "./tokens";
import { SecurityWorkflowNotifier } from "./contracts";

const EMAIL_TOKEN_BYTES = 24;
const REFRESH_TOKEN_BYTES = 32;
const PASSWORD_ROUNDS = 12;

@Injectable()
export class SecurityAuthService {
  constructor(
    @InjectRepository(AppUserEntity)
    private readonly appUsersRepo: Repository<AppUserEntity>,
    @InjectRepository(SecurityUserEntity)
    private readonly securityUsersRepo: Repository<SecurityUserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly passwordResetRepo: Repository<PasswordResetTokenEntity>,
    @InjectRepository(SecurityRoleEntity)
    private readonly rolesRepo: Repository<SecurityRoleEntity>,
    @InjectRepository(SecurityUserRoleEntity)
    private readonly userRolesRepo: Repository<SecurityUserRoleEntity>,
    @Inject(SECURITY_AUTH_OPTIONS)
    private readonly options: SecurityAuthModuleOptions,
    @Inject(SECURITY_WORKFLOW_NOTIFIER)
    private readonly notifier: SecurityWorkflowNotifier,
  ) {}

  async register(params: {
    email: string;
    password: string;
  }): Promise<RegisterResponse> {
    const email = sanitizeEmail(params.email);
    const existing = await this.appUsersRepo.findOne({ where: { email } });
    if (existing) {
      throw new BadRequestException("Email already in use");
    }

    const appUser = await this.appUsersRepo.save(
      this.appUsersRepo.create({
        id: uuidv7(),
        email,
      }),
    );
    const securityUser = await this.securityUsersRepo.save(
      this.securityUsersRepo.create({
        userId: appUser.id,
        passwordHash: await hash(params.password, PASSWORD_ROUNDS),
        emailVerifiedAt: null,
        emailVerificationToken: null,
        adminApprovedAt: null,
        isActive: true,
      }),
    );

    const verificationToken = await this.createEmailVerificationToken(
      appUser.id,
    );
    if (this.notifier.sendEmailVerification) {
      await this.notifier.sendEmailVerification({
        email: appUser.email,
        token: verificationToken,
      });
    }

    return {
      success: true,
      user: await this.toSafeUser(appUser, securityUser),
      debugToken: verificationToken,
    };
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const email = sanitizeEmail(params.email);
    const appUser = await this.appUsersRepo.findOne({ where: { email } });
    if (!appUser) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const securityUser = await this.securityUsersRepo.findOne({
      where: { userId: appUser.id },
    });
    if (!securityUser) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const ok = await compare(params.password, securityUser.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    this.assertCanAuthenticate(securityUser);
    return this.issueTokens(appUser, securityUser);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const record = await this.findValidRefreshToken(refreshToken);
    if (!record) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    await this.refreshTokenRepo.update(
      { id: record.id },
      { revokedAt: new Date() },
    );
    const appUser = await this.appUsersRepo.findOne({
      where: { id: record.userId ?? "" },
    });
    if (!appUser) {
      throw new UnauthorizedException("User not found");
    }
    const securityUser = await this.securityUsersRepo.findOne({
      where: { userId: appUser.id },
    });
    if (!securityUser) {
      throw new UnauthorizedException("User not found");
    }
    this.assertCanAuthenticate(securityUser);
    return this.issueTokens(appUser, securityUser);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { success: true as const };
    }
    const record = await this.findValidRefreshToken(refreshToken, false);
    if (record && !record.revokedAt) {
      await this.refreshTokenRepo.update(
        { id: record.id },
        { revokedAt: new Date() },
      );
    }
    return { success: true as const };
  }

  async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }) {
    const securityUser = await this.securityUsersRepo.findOne({
      where: { userId: params.userId },
    });
    if (!securityUser) {
      throw new BadRequestException("User not found");
    }
    const ok = await compare(params.currentPassword, securityUser.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    await this.securityUsersRepo.update(
      { userId: securityUser.userId },
      { passwordHash: await hash(params.newPassword, PASSWORD_ROUNDS) },
    );
    return { success: true as const };
  }

  async requestForgotPassword(emailInput: string) {
    const email = sanitizeEmail(emailInput);
    const appUser = await this.appUsersRepo.findOne({ where: { email } });
    if (!appUser) {
      return { success: true as const };
    }
    const securityUser = await this.securityUsersRepo.findOne({
      where: { userId: appUser.id },
    });
    if (!securityUser) {
      return { success: true as const };
    }
    const token = randomBytes(EMAIL_TOKEN_BYTES).toString("hex");
    const expiresAt = new Date(
      Date.now() +
        (this.options.passwordResetTokenExpiresInMinutes ?? 30) * 60_000,
    );
    await this.passwordResetRepo.save(
      this.passwordResetRepo.create({
        id: uuidv7(),
        userId: appUser.id,
        token,
        expiresAt,
        usedAt: null,
      }),
    );
    if (this.notifier.sendPasswordReset) {
      await this.notifier.sendPasswordReset({ email: appUser.email, token });
    }
    return { success: true as const };
  }

  async resetPassword(token: string, newPassword: string) {
    const reset = await this.passwordResetRepo.findOne({ where: { token } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Invalid password reset token");
    }
    await this.securityUsersRepo.update(
      { userId: reset.userId },
      { passwordHash: await hash(newPassword, PASSWORD_ROUNDS) },
    );
    await this.passwordResetRepo.update(
      { id: reset.id },
      { usedAt: new Date() },
    );
    return { success: true as const };
  }

  async verifyEmailByToken(token: string) {
    const user = await this.securityUsersRepo.findOne({
      where: { emailVerificationToken: token },
    });
    if (!user) {
      throw new BadRequestException("Invalid verification token");
    }
    await this.securityUsersRepo.update(
      { userId: user.userId },
      { emailVerifiedAt: new Date(), emailVerificationToken: null },
    );
    return { success: true as const };
  }

  async getMyRoles(userId: string) {
    return { userId, roles: await this.getUserRoleKeys(userId) };
  }

  async getUserIdByVerificationToken(token: string): Promise<string | null> {
    const user = await this.securityUsersRepo.findOne({
      where: { emailVerificationToken: token },
    });
    return user?.userId ?? null;
  }

  private assertCanAuthenticate(user: SecurityUserEntity) {
    if (!user.isActive) {
      throw new UnauthorizedException("Account is inactive");
    }
    if (
      (this.options.requireEmailVerification ?? true) &&
      !user.emailVerifiedAt
    ) {
      throw new UnauthorizedException("Email verification required");
    }
    if ((this.options.requireAdminApproval ?? true) && !user.adminApprovedAt) {
      throw new UnauthorizedException("Admin approval required");
    }
  }

  private async issueTokens(
    appUser: AppUserEntity,
    securityUser: SecurityUserEntity,
  ): Promise<AuthResponse> {
    const roles = await this.getUserRoleKeys(appUser.id);
    const accessTokenExpiresIn = this.options.accessTokenExpiresIn ?? "15m";
    const accessToken = sign(
      { sub: appUser.id, email: appUser.email, roles },
      this.options.jwtSecret,
      { expiresIn: accessTokenExpiresIn as SignOptions["expiresIn"] },
    );
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
    const refreshTokenHash = await hash(refreshToken, PASSWORD_ROUNDS);
    const refreshTokenExpiresAt = new Date(
      Date.now() +
        (this.options.refreshTokenExpiresInDays ?? 30) * 24 * 60 * 60 * 1000,
    );

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        id: uuidv7(),
        userId: appUser.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
        revokedAt: null,
      }),
    );

    const user = await this.toSafeUser(appUser, securityUser);
    return {
      accessToken,
      accessTokenExpiresIn,
      refreshToken,
      refreshTokenExpiresAt,
      userId: appUser.id,
      roles,
      user,
    };
  }

  private async createEmailVerificationToken(userId: string) {
    const token = randomBytes(EMAIL_TOKEN_BYTES).toString("hex");
    await this.securityUsersRepo.update(
      { userId },
      { emailVerificationToken: token },
    );
    return token;
  }

  private async findValidRefreshToken(token: string, onlyUnexpired = true) {
    const candidates = await this.refreshTokenRepo.find({
      where: { revokedAt: IsNull() },
      order: { createdAt: "DESC" },
      take: 50,
    });
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
    const assignments = await this.userRolesRepo.find({ where: { userId } });
    if (assignments.length === 0) {
      return [] as string[];
    }
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roles = await this.rolesRepo.find({ where: { id: In(roleIds) } });
    return roles.map((role) => normalizeRoleName(role.roleKey)).sort();
  }

  private async toSafeUser(
    appUser: AppUserEntity,
    securityUser: SecurityUserEntity,
  ) {
    return {
      id: appUser.id,
      email: appUser.email,
      firstName: appUser.firstName ?? null,
      lastName: appUser.lastName ?? null,
      phone: null,
      roles: await this.getUserRoleKeys(appUser.id),
      emailVerifiedAt: securityUser.emailVerifiedAt,
      phoneVerifiedAt: null,
      adminApprovedAt: securityUser.adminApprovedAt,
      isActive: securityUser.isActive,
    };
  }
}
