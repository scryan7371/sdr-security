import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { v7 as uuidv7 } from "uuid";
import { ADMIN_ROLE } from "../api/contracts";
import { normalizeRoleName } from "../api/roles";
import { AppUserEntity } from "./entities/app-user.entity";
import { SecurityRoleEntity } from "./entities/security-role.entity";
import { SecurityUserEntity } from "./entities/security-user.entity";
import { SecurityUserRoleEntity } from "./entities/security-user-role.entity";
import { SecurityWorkflowNotifier } from "./contracts";
import { SECURITY_WORKFLOW_NOTIFIER } from "./tokens";

@Injectable()
export class SecurityWorkflowsService {
  constructor(
    @InjectRepository(AppUserEntity)
    private readonly appUsersRepo: Repository<AppUserEntity>,
    @InjectRepository(SecurityUserEntity)
    private readonly securityUsersRepo: Repository<SecurityUserEntity>,
    @InjectRepository(SecurityRoleEntity)
    private readonly rolesRepo: Repository<SecurityRoleEntity>,
    @InjectRepository(SecurityUserRoleEntity)
    private readonly userRolesRepo: Repository<SecurityUserRoleEntity>,
    @Inject(SECURITY_WORKFLOW_NOTIFIER)
    private readonly notifier: SecurityWorkflowNotifier,
  ) {}

  async markEmailVerifiedAndNotifyAdmins(userId: string) {
    await this.securityUsersRepo.update(
      { userId },
      { emailVerifiedAt: new Date(), emailVerificationToken: null },
    );

    const user = await this.appUsersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const adminEmails = await this.listAdminEmails();
    if (adminEmails.length === 0) {
      return { success: true as const, notified: false as const, adminEmails };
    }

    await this.notifier.sendAdminsUserEmailVerified({
      adminEmails,
      user: {
        id: user.id,
        email: user.email,
      },
    });

    return { success: true as const, notified: true as const, adminEmails };
  }

  async setAdminApprovalAndNotifyUser(userId: string, approved: boolean) {
    await this.securityUsersRepo.update(
      { userId },
      { adminApprovedAt: approved ? new Date() : null },
    );

    const user = await this.appUsersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!approved) {
      return { success: true as const, notified: false as const };
    }

    await this.notifier.sendUserAccountApproved({
      email: user.email,
    });

    return { success: true as const, notified: true as const };
  }

  async listAdminEmails() {
    const rows = await this.userRolesRepo
      .createQueryBuilder("userRole")
      .innerJoin("security_role", "role", "role.id = userRole.role_id")
      .innerJoin("app_user", "user", "user.id = userRole.user_id")
      .innerJoin(
        "security_user",
        "securityUser",
        "securityUser.user_id = userRole.user_id",
      )
      .where("role.role_key = :roleKey", { roleKey: ADMIN_ROLE })
      .andWhere("securityUser.is_active = :isActive", { isActive: true })
      .select("DISTINCT user.email", "email")
      .getRawMany<{ email: string }>();

    return rows.map((row) => row.email).filter(Boolean);
  }

  async listRoles() {
    const roles = await this.rolesRepo.find({ order: { roleKey: "ASC" } });
    return roles.map((role) => ({
      role: role.roleKey,
      description: role.description,
      isSystem: role.isSystem,
    }));
  }

  async createRole(roleName: string, description?: string | null) {
    const roleKey = normalizeRoleName(roleName);
    let role = await this.rolesRepo.findOne({ where: { roleKey } });
    if (!role) {
      role = this.rolesRepo.create({
        id: uuidv7(),
        roleKey,
        description: description?.trim() || null,
        isSystem: roleKey === ADMIN_ROLE,
      });
      await this.rolesRepo.save(role);
    } else if (description !== undefined) {
      role.description = description?.trim() || null;
      await this.rolesRepo.save(role);
    }

    return this.listRoles();
  }

  async removeRole(roleName: string) {
    const roleKey = normalizeRoleName(roleName);
    const role = await this.rolesRepo.findOne({ where: { roleKey } });
    if (!role || role.isSystem || role.roleKey === ADMIN_ROLE) {
      return { success: false as const };
    }

    await this.userRolesRepo.delete({ roleId: role.id });
    await this.rolesRepo.delete({ id: role.id });
    return { success: true as const };
  }

  async getUserRoles(userId: string) {
    await this.assertUserExists(userId);
    const assignments = await this.userRolesRepo.find({ where: { userId } });
    if (assignments.length === 0) {
      return { userId, roles: [] as string[] };
    }
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roles = await this.rolesRepo.find({
      where: { id: In(roleIds) },
      order: { roleKey: "ASC" },
    });
    return { userId, roles: roles.map((role) => role.roleKey) };
  }

  async setUserRoles(userId: string, roleNames: string[]) {
    await this.assertUserExists(userId);
    const normalized = [...new Set(roleNames.map(normalizeRoleName))];
    await this.ensureRoles(normalized);
    const roles = normalized.length
      ? await this.rolesRepo.find({ where: { roleKey: In(normalized) } })
      : [];

    await this.userRolesRepo.delete({ userId });
    if (roles.length > 0) {
      await this.userRolesRepo.save(
        roles.map((role) =>
          this.userRolesRepo.create({
            id: uuidv7(),
            userId,
            roleId: role.id,
          }),
        ),
      );
    }
    return { userId, roles: normalized };
  }

  async assignRoleToUser(userId: string, roleName: string) {
    const existing = await this.getUserRoles(userId);
    const nextRoles = [
      ...new Set([...existing.roles, normalizeRoleName(roleName)]),
    ];
    return this.setUserRoles(userId, nextRoles);
  }

  async removeRoleFromUser(userId: string, roleName: string) {
    const normalized = normalizeRoleName(roleName);
    const existing = await this.getUserRoles(userId);
    const nextRoles = existing.roles.filter((role) => role !== normalized);
    return this.setUserRoles(userId, nextRoles);
  }

  async setUserActive(userId: string, active: boolean) {
    await this.securityUsersRepo.update({ userId }, { isActive: active });
    return { success: true as const, userId, active };
  }

  private async assertUserExists(userId: string) {
    const user = await this.appUsersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  private async ensureRoles(roleKeys: string[]) {
    if (roleKeys.length === 0) {
      return;
    }
    const existing = await this.rolesRepo.find({
      where: { roleKey: In(roleKeys) },
    });
    const existingSet = new Set(existing.map((role) => role.roleKey));
    const missing = roleKeys.filter((roleKey) => !existingSet.has(roleKey));
    if (missing.length === 0) {
      return;
    }
    await this.rolesRepo.save(
      missing.map((roleKey) =>
        this.rolesRepo.create({
          id: uuidv7(),
          roleKey,
          description: null,
          isSystem: roleKey === ADMIN_ROLE,
        }),
      ),
    );
  }
}
