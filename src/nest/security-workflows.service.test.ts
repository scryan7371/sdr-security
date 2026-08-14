import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityWorkflowsService } from "./security-workflows.service";
import {securityRole, securityUser, securityUserRole, user} from "../drizzle";

const makeRepo = () => ({
  update: vi.fn(async (_criteria: unknown, _value: unknown) => ({ affected: 1 })),
  findOne: vi.fn(),
  find: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  save: vi.fn(async (value: any) => value),
  create: vi.fn((value: any) => value),
  delete: vi.fn(async (_criteria: unknown) => ({ affected: 1 })),
  createQueryBuilder: vi.fn(),
});

const makeNotifier = () => ({
  sendAdminsUserEmailVerified: vi.fn(async () => undefined),
  sendUserAccountApproved: vi.fn(async () => undefined),
});

type MockRepo = ReturnType<typeof makeRepo>;

const makeDb = (repos: {
  appUsersRepo: MockRepo;
  securityUsersRepo: MockRepo;
  rolesRepo: MockRepo;
  userRolesRepo: MockRepo;
}) => {
  const adminEmails = vi.fn(async (): Promise<Array<{email: string}>> => []);

  const repoFor = (table: unknown) => {
    if (table === user) return repos.appUsersRepo;
    if (table === securityUser) return repos.securityUsersRepo;
    if (table === securityRole) return repos.rolesRepo;
    if (table === securityUserRole) return repos.userRolesRepo;
    throw new Error("Unexpected table in Drizzle mock");
  };

  const resultFor = async (table: unknown, filtered: boolean) => {
    const repo = repoFor(table);
    if (table === user) {
      const row = await repo.findOne();
      return row ? [row] : null;
    }
    if (table === securityRole && filtered && repo.findOne.getMockImplementation()) {
      const row = await repo.findOne();
      return row ? [row] : null;
    }
    return repo.find();
  };

  const queryFor = (table: unknown) => {
    let filtered = false;
    const query = {
      where: vi.fn(() => {
        filtered = true;
        return query;
      }),
      orderBy: vi.fn(() => resultFor(table, filtered)),
      then: (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => resultFor(table, filtered).then(resolve, reject),
    };
    return query;
  };

  const db = {
    select: vi.fn(() => ({from: vi.fn((table: unknown) => queryFor(table))})),
    selectDistinct: vi.fn(() => {
      const query = {
        from: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => adminEmails()),
      };
      return query;
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (value: unknown) => {
        const repo = repoFor(table);
        return repo.save(repo.create(value));
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((value: unknown) => ({
        where: vi.fn(async () => repoFor(table).update({}, value)),
      })),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => repoFor(table).delete({})),
    })),
  };

  return {db, adminEmails};
};

const makeUser = () => ({
  id: "user-1",
  email: "user@example.com",
  isActive: true,
});

const setup = () => {
  const appUsersRepo = makeRepo();
  const securityUsersRepo = makeRepo();
  const rolesRepo = makeRepo();
  const userRolesRepo = makeRepo();
  const notifier = makeNotifier();
  const {db, adminEmails} = makeDb({
    appUsersRepo,
    securityUsersRepo,
    rolesRepo,
    userRolesRepo,
  });

  const service = new SecurityWorkflowsService(
    db as never,
    notifier as never,
  );

  return {
    service,
    appUsersRepo,
    securityUsersRepo,
    rolesRepo,
    userRolesRepo,
    notifier,
    adminEmails,
  };
};

describe("SecurityWorkflowsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks email verified and notifies admins", async () => {
    const { service, appUsersRepo, notifier, adminEmails } = setup();
    appUsersRepo.findOne.mockResolvedValue(makeUser());
    adminEmails.mockResolvedValue([{ email: "admin@example.com" }]);

    const result = await service.markEmailVerifiedAndNotifyAdmins("user-1");

    expect(result).toEqual({
      success: true,
      notified: true,
      adminEmails: ["admin@example.com"],
    });
    expect(notifier.sendAdminsUserEmailVerified).toHaveBeenCalled();
  });

  it("returns not-notified when no admins are present", async () => {
    const { service, appUsersRepo, adminEmails } = setup();
    appUsersRepo.findOne.mockResolvedValue(makeUser());
    adminEmails.mockResolvedValue([]);

    await expect(
      service.markEmailVerifiedAndNotifyAdmins("user-1"),
    ).resolves.toEqual({ success: true, notified: false, adminEmails: [] });
  });

  it("throws when user is missing during verification flow", async () => {
    const { service, appUsersRepo } = setup();
    appUsersRepo.findOne.mockResolvedValue(null);

    await expect(
      service.markEmailVerifiedAndNotifyAdmins("missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("handles admin approval notifications", async () => {
    const { service, appUsersRepo, notifier } = setup();
    appUsersRepo.findOne.mockResolvedValue(makeUser());

    await expect(
      service.setAdminApprovalAndNotifyUser("user-1", false),
    ).resolves.toEqual({ success: true, notified: false });

    await expect(
      service.setAdminApprovalAndNotifyUser("user-1", true),
    ).resolves.toEqual({ success: true, notified: true });

    expect(notifier.sendUserAccountApproved).toHaveBeenCalledWith({
      email: "user@example.com",
    });
  });

  it("throws when approval target user is missing", async () => {
    const { service, appUsersRepo } = setup();
    appUsersRepo.findOne.mockResolvedValue(null);

    await expect(
      service.setAdminApprovalAndNotifyUser("missing", true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("manages role catalog and protected role removal", async () => {
    const { service, rolesRepo, userRolesRepo } = setup();
    rolesRepo.find.mockResolvedValue([
      { roleKey: "ADMIN", description: null, isSystem: true },
    ]);

    await expect(service.listRoles()).resolves.toEqual([
      { role: "ADMIN", description: null, isSystem: true },
    ]);

    rolesRepo.findOne.mockResolvedValue(null);
    rolesRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { roleKey: "COACH", description: null, isSystem: false },
      ]);
    await service.createRole("coach", " Coach ");
    expect(rolesRepo.save).toHaveBeenCalled();

    rolesRepo.findOne.mockResolvedValue({
      id: "r1",
      roleKey: "ADMIN",
      isSystem: true,
    });
    await expect(service.removeRole("ADMIN")).resolves.toEqual({
      success: false,
    });

    rolesRepo.findOne.mockResolvedValue({
      id: "r2",
      roleKey: "COACH",
      isSystem: false,
    });
    await expect(service.removeRole("COACH")).resolves.toEqual({
      success: true,
    });
    expect(userRolesRepo.delete).toHaveBeenCalled();
  });

  it("gets and sets user roles", async () => {
    const { service, appUsersRepo, userRolesRepo, rolesRepo } = setup();
    appUsersRepo.findOne.mockResolvedValue(makeUser());
    userRolesRepo.find.mockResolvedValue([{ roleId: "r1" }]);
    rolesRepo.find.mockResolvedValue([{ id: "r1", roleKey: "ADMIN" }]);

    await expect(service.getUserRoles("user-1")).resolves.toEqual({
      userId: "user-1",
      roles: ["ADMIN"],
    });

    rolesRepo.find
      .mockResolvedValueOnce([{ roleKey: "ADMIN" }])
      .mockResolvedValueOnce([{ id: "r1", roleKey: "ADMIN" }]);
    await expect(
      service.setUserRoles("user-1", ["admin", "admin"]),
    ).resolves.toEqual({
      userId: "user-1",
      roles: ["ADMIN"],
    });
    expect(userRolesRepo.save).toHaveBeenCalled();
  });

  it("assigns and removes role from user", async () => {
    const { service, appUsersRepo, userRolesRepo, rolesRepo } = setup();
    appUsersRepo.findOne.mockResolvedValue(makeUser());

    userRolesRepo.find.mockResolvedValue([]);
    rolesRepo.find.mockResolvedValue([]);
    await service.assignRoleToUser("user-1", "coach");

    userRolesRepo.find.mockResolvedValue([{ roleId: "r1" }]);
    rolesRepo.find
      .mockResolvedValueOnce([{ id: "r1", roleKey: "COACH" }])
      .mockResolvedValueOnce([]);
    await service.removeRoleFromUser("user-1", "coach");

    expect(userRolesRepo.delete).toHaveBeenCalled();
  });

  it("sets user active state", async () => {
    const { service, securityUsersRepo } = setup();
    await expect(service.setUserActive("user-1", false)).resolves.toEqual({
      success: true,
      userId: "user-1",
      active: false,
    });
    expect(securityUsersRepo.update).toHaveBeenCalledWith({}, { active: false });
  });

  it("throws when role operations target missing user", async () => {
    const { service, appUsersRepo } = setup();
    appUsersRepo.findOne.mockResolvedValue(null);

    await expect(service.getUserRoles("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.setUserRoles("missing", ["ADMIN"]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
