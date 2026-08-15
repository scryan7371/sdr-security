import {Inject, Injectable, NotFoundException} from "@nestjs/common";
import {uuidv7} from "./uuid-v7";
import {SecurityWorkflowNotifier} from "./contracts";
import {SECURITY_WORKFLOW_NOTIFIER} from "./tokens";
import {ADMIN_ROLE, normalizeRoleName} from "../api";
import {SECURITY_DRIZZLE_DB, SecurityDatabase} from "./security-drizzle.module";
import {securityRole, securityUser, securityUserRole, user} from "../drizzle";
import {and, asc, eq, inArray, Placeholder, SQL} from "drizzle-orm";

@Injectable()
export class SecurityWorkflowsService {
    constructor(@Inject(SECURITY_DRIZZLE_DB) private readonly db: SecurityDatabase, @Inject(SECURITY_WORKFLOW_NOTIFIER) private readonly notifier: SecurityWorkflowNotifier,) {
    }

    async markEmailVerifiedAndNotifyAdmins(userId: string) {
        await this.db.update(securityUser).set({
            emailVerifiedAt: new Date(), emailVerificationToken: null
        }).where(eq(securityUser.id, userId))
        const theUser = await this.db.select().from(user).where(eq(user.id, userId));
        if (!theUser) {
            throw new NotFoundException("User not found");
        }
        const adminEmails = await this.listAdminEmails();
        if (adminEmails.length === 0) {
            return {
                success: true as const, notified: false as const, adminEmails
            };
        }
        await this.notifier.sendAdminsUserEmailVerified({
            adminEmails, user: {
                id: theUser[0].id,
                email: theUser[0].email,
                firstName: theUser[0].firstName,
                lastName: theUser[0].lastName,
            },
        });
        return {success: true as const, notified: true as const, adminEmails};
    }

    async setAdminApprovalAndNotifyUser(userId: string, approved: boolean) {
        await this.db.update(securityUser).set({adminApprovedAt: approved ? new Date() : null},).where(eq(securityUser.id, userId))
        const theUser = await this.db.select().from(user).where(eq(user.id, userId));
        if (!theUser) {
            throw new NotFoundException("User not found");
        }
        if (!approved) {
            return {success: true as const, notified: false as const};
        }
        await this.notifier.sendUserAccountApproved({
            email: theUser[0].email,
            firstName: theUser[0].firstName,
            lastName: theUser[0].lastName,
        });
        return {success: true as const, notified: true as const};
    }

    async listAdminEmails() {
        const rows = await this.db
            .selectDistinct({email: user.email})
            .from(securityUserRole)
            .innerJoin(securityRole, eq(securityRole.id, securityUserRole.roleId))
            .innerJoin(user, eq(user.id, securityUserRole.userId))
            .innerJoin(securityUser, eq(securityUser.userId, securityUserRole.userId))
            .where(and(eq(securityRole.roleKey, ADMIN_ROLE), eq(securityUser.active, true)));
        return rows.map((row) => row.email).filter(Boolean);
    }

    async listRoles() {
        const roles = await this.db.select().from(securityRole).orderBy(asc(securityRole.roleKey));
        return roles.map((role) => ({
            role: role.roleKey,
            description: role.description,
            isSystem: role.isSystem,
        }));
    }

    async createRole(roleName: string, description?: string | null) {
        const roleKey = normalizeRoleName(roleName);
        let role = await this.db.select().from(securityRole).where(eq(securityRole.roleKey, roleKey));
        if (!role) {
            this.db.insert(securityRole).values({
                id: uuidv7(),
                roleKey: roleKey,
                description: description?.trim() || null,
                isSystem: roleKey === ADMIN_ROLE,
            });
        } else
            if (description !== undefined) {
                await this.db.update(securityRole).set({description: description?.trim() || null}).where(eq(securityRole.id, role[0].id));
            }
        return this.listRoles();
    }

    async removeRole(roleName: string) {
        const roleKey = normalizeRoleName(roleName);
        const role = await this.db.select().from(securityRole).where(eq(securityRole.roleKey, roleKey));
        if (!role || role[0].isSystem || role[0].roleKey === ADMIN_ROLE) {
            return {success: false as const};
        }
        await this.db.delete(securityUserRole).where(eq(securityUserRole.roleId, role[0].id));
        await this.db.delete(securityRole).where(eq(securityRole.id, role[0].id));
        return {success: true as const};
    }

    async getUserRoles(userId: string) {
        await this.assertUserExists(userId);
        const assignments = await this.db.select().from(securityUserRole).where(eq(securityUserRole.userId, userId));
        if (assignments.length === 0) {
            return {userId, roles: [] as string[]};
        }
        const roleIds = assignments.map((assignment) => assignment.roleId);
        const roles = await this.db.select().from(securityRole).where(inArray(securityRole.id, roleIds)).orderBy(asc(securityRole.roleKey))
        return {userId, roles: roles.map((role) => role.roleKey)};
    }

    async setUserRoles(userId: string, roleNames: string[]) {
        await this.assertUserExists(userId);
        const normalized = [...new Set(roleNames.map(normalizeRoleName))];
        await this.ensureRoles(normalized);
        const roles = normalized.length ? await this.db.select().from(securityRole).where(inArray(securityRole.roleKey, normalized)) : [];
        await this.db.delete(securityUserRole).where(eq(securityUserRole.userId, userId));
        if (roles.length > 0) {
            const rolesToCreate: {
                userId: string | SQL<unknown> | Placeholder<string, any>;
                roleId: string | SQL<unknown> | Placeholder<string, any>;
                id?: string | SQL<unknown> | Placeholder<string, any> | undefined;
            }[] = []
            roles.forEach((theRole) => {
                rolesToCreate.push({
                    id: uuidv7(), userId: userId, roleId: theRole.id
                })
            })
            await this.db.insert(securityUserRole).values(rolesToCreate)
        }
        return {userId, roles: normalized};
    }

    async assignRoleToUser(userId: string, roleName: string) {
        const existing = await this.getUserRoles(userId);
        const nextRoles = [...new Set([...existing.roles, normalizeRoleName(roleName)]),];
        return this.setUserRoles(userId, nextRoles);
    }

    async removeRoleFromUser(userId: string, roleName: string) {
        const normalized = normalizeRoleName(roleName);
        const existing = await this.getUserRoles(userId);
        const nextRoles = existing.roles.filter((role) => role !== normalized);
        return this.setUserRoles(userId, nextRoles);
    }

    async setUserActive(userId: string, active: boolean) {
        await this.db.update(securityUser).set({active: active}).where(eq(securityUser.id, userId));
        return {success: true as const, userId, active};
    }

    private async assertUserExists(userId: string) {
        const theUser = await this.db.select().from(user).where(eq(user.id, userId));
        if (!theUser) {
            throw new NotFoundException("User not found");
        }
        return theUser[0];
    }

    private async ensureRoles(roleKeys: string[]) {
        if (roleKeys.length === 0) {
            return;
        }
        const existing = await this.db.select().from(securityRole).where(inArray(securityRole.roleKey, roleKeys));
        const existingSet = new Set(existing.map((role) => role.roleKey));
        const missing = roleKeys.filter((roleKey) => !existingSet.has(roleKey));
        if (missing.length === 0) {
            return;
        }
        const rolesToCreate: {
            roleKey: string | SQL<unknown> | Placeholder<string, any>;
            id?: string | SQL<unknown> | Placeholder<string, any> | undefined;
            description?: string | SQL<unknown> | Placeholder<string, any> | null | undefined;
            isSystem?: boolean | SQL<unknown> | Placeholder<string, any> | undefined;
        }[] = [];
        missing.forEach((roleKey) => {
            rolesToCreate.push({
                id: uuidv7(),
                roleKey: roleKey,
                description: null,
                isSystem: roleKey === ADMIN_ROLE,
            })
        })
        await this.db.insert(securityRole).values(rolesToCreate);
    }
}
