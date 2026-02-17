import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "crypto";
import { compare, hash } from "bcryptjs";
import { sign, type SignOptions } from "jsonwebtoken";
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
    private readonly usersRepo: Repository<AppUserEntity>,
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
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<RegisterResponse> {
    const email = sanitizeEmail(params.email);
    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      throw new BadRequestException("Email already in use");
    }

    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email,
        passwordHash: await hash(params.password, PASSWORD_ROUNDS),
        firstName: params.firstName ?? null,
        lastName: params.lastName ?? null,
        emailVerifiedAt: null,
        emailVerificationToken: null,
        adminApprovedAt: null,
        isActive: true,
      }),
    );

    const verificationToken = await this.createEmailVerificationToken(user.id);
    if (this.notifier.sendEmailVerification) {
      await this.notifier.sendEmailVerification({
        email: user.email,
        token: verificationToken,
      });
    }

    return {
      success: true,
      user: await this.toSafeUser(user),
      debugToken: verificationToken,
    };
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const email = sanitizeEmail(params.email);
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const ok = await compare(params.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    this.assertCanAuthenticate(user);
    return this.issueTokens(user);
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
    const user = await this.usersRepo.findOne({
      where: { id: record.userId ?? "" },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    this.assertCanAuthenticate(user);
    return this.issueTokens(user);
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
    const user = await this.usersRepo.findOne({ where: { id: params.userId } });
    if (!user) {
      throw new BadRequestException("User not found");
    }
    const ok = await compare(params.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    await this.usersRepo.update(
      { id: user.id },
      { passwordHash: await hash(params.newPassword, PASSWORD_ROUNDS) },
    );
    return { success: true as const };
  }

  async requestForgotPassword(emailInput: string) {
    const email = sanitizeEmail(emailInput);
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      return { success: true as const };
    }
    const token = randomBytes(EMAIL_TOKEN_BYTES).toString("hex");
    const expiresAt = new Date(
      Date.now() +
        (this.options.passwordResetTokenExpiresInMinutes ?? 30) * 60_000,
    );
    await this.passwordResetRepo.save(
      this.passwordResetRepo.create({
        userId: user.id,
        token,
        expiresAt,
        usedAt: null,
      }),
    );
    if (this.notifier.sendPasswordReset) {
      await this.notifier.sendPasswordReset({ email: user.email, token });
    }
    return { success: true as const };
  }

  async resetPassword(token: string, newPassword: string) {
    const reset = await this.passwordResetRepo.findOne({ where: { token } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Invalid password reset token");
    }
    await this.usersRepo.update(
      { id: reset.userId },
      { passwordHash: await hash(newPassword, PASSWORD_ROUNDS) },
    );
    await this.passwordResetRepo.update(
      { id: reset.id },
      { usedAt: new Date() },
    );
    return { success: true as const };
  }

  async verifyEmailByToken(token: string) {
    const user = await this.usersRepo.findOne({
      where: { emailVerificationToken: token },
    });
    if (!user) {
      throw new BadRequestException("Invalid verification token");
    }
    await this.usersRepo.update(
      { id: user.id },
      { emailVerifiedAt: new Date(), emailVerificationToken: null },
    );
    return { success: true as const };
  }

  async getMyRoles(userId: string) {
    return { userId, roles: await this.getUserRoleKeys(userId) };
  }

  private assertCanAuthenticate(user: AppUserEntity) {
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

  private async issueTokens(user: AppUserEntity): Promise<AuthResponse> {
    const roles = await this.getUserRoleKeys(user.id);
    const accessTokenExpiresIn = this.options.accessTokenExpiresIn ?? "15m";
    const accessToken = sign(
      { sub: user.id, email: user.email, roles },
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
        id: randomUUID(),
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
        revokedAt: null,
      }),
    );

    return {
      accessToken,
      accessTokenExpiresIn,
      refreshToken,
      refreshTokenExpiresAt,
      user: await this.toSafeUser(user),
    };
  }

  private async createEmailVerificationToken(userId: string) {
    const token = randomBytes(EMAIL_TOKEN_BYTES).toString("hex");
    await this.usersRepo.update(
      { id: userId },
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

  private async toSafeUser(user: AppUserEntity) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: null,
      roles: await this.getUserRoleKeys(user.id),
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: null,
      adminApprovedAt: user.adminApprovedAt,
      isActive: user.isActive,
    };
  }
}
