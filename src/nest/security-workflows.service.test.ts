import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityWorkflowsService } from "./security-workflows.service";

const makeRepo = () => ({
  update: vi.fn(async () => ({ affected: 1 })),
  findOne: vi.fn(),
  find: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  save: vi.fn(async (value: any) => value),
  create: vi.fn((value: any) => value),
  delete: vi.fn(async () => ({ affected: 1 })),
  createQueryBuilder: vi.fn(),
});

const makeNotifier = () => ({
  sendAdminsUserEmailVerified: vi.fn(async () => undefined),
  sendUserAccountApproved: vi.fn(async () => undefined),
});

const makeUser = () => ({
  id: "user-1",
  email: "user@example.com",
  firstName: "A",
  lastName: "B",
  isActive: true,
});

const setup = () => {
  const usersRepo = makeRepo();
  const rolesRepo = makeRepo();
  const userRolesRepo = makeRepo();
  const notifier = makeNotifier();

  const service = new SecurityWorkflowsService(
    usersRepo as never,
    rolesRepo as never,
    userRolesRepo as never,
    notifier as never,
  );

  return { service, usersRepo, rolesRepo, userRolesRepo, notifier };
};

describe("SecurityWorkflowsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks email verified and notifies admins", async () => {
    const { service, usersRepo, userRolesRepo, notifier } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());

    const getRawMany = vi
      .fn()
      .mockResolvedValue([{ email: "admin@example.com" }]);
    const qb = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      getRawMany,
    };
    userRolesRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.markEmailVerifiedAndNotifyAdmins("user-1");

    expect(result).toEqual({
      success: true,
      notified: true,
      adminEmails: ["admin@example.com"],
    });
    expect(notifier.sendAdminsUserEmailVerified).toHaveBeenCalled();
  });

  it("returns not-notified when no admins are present", async () => {
    const { service, usersRepo, userRolesRepo } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());

    const qb = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    userRolesRepo.createQueryBuilder.mockReturnValue(qb);

    await expect(
      service.markEmailVerifiedAndNotifyAdmins("user-1"),
    ).resolves.toEqual({ success: true, notified: false, adminEmails: [] });
  });

  it("throws when user is missing during verification flow", async () => {
    const { service, usersRepo } = setup();
    usersRepo.findOne.mockResolvedValue(null);

    await expect(
      service.markEmailVerifiedAndNotifyAdmins("missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("handles admin approval notifications", async () => {
    const { service, usersRepo, notifier } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());

    await expect(
      service.setAdminApprovalAndNotifyUser("user-1", false),
    ).resolves.toEqual({ success: true, notified: false });

    await expect(
      service.setAdminApprovalAndNotifyUser("user-1", true),
    ).resolves.toEqual({ success: true, notified: true });

    expect(notifier.sendUserAccountApproved).toHaveBeenCalledWith({
      email: "user@example.com",
      firstName: "A",
    });
  });

  it("throws when approval target user is missing", async () => {
    const { service, usersRepo } = setup();
    usersRepo.findOne.mockResolvedValue(null);

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
    expect(userRolesRepo.delete).toHaveBeenCalledWith({ roleId: "r2" });
  });

  it("gets and sets user roles", async () => {
    const { service, usersRepo, userRolesRepo, rolesRepo } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());
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
    const { service, usersRepo, userRolesRepo, rolesRepo } = setup();
    usersRepo.findOne.mockResolvedValue(makeUser());

    userRolesRepo.find.mockResolvedValue([]);
    rolesRepo.find.mockResolvedValue([]);
    await service.assignRoleToUser("user-1", "coach");

    userRolesRepo.find.mockResolvedValue([{ roleId: "r1" }]);
    rolesRepo.find
      .mockResolvedValueOnce([{ id: "r1", roleKey: "COACH" }])
      .mockResolvedValueOnce([]);
    await service.removeRoleFromUser("user-1", "coach");

    expect(userRolesRepo.delete).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("sets user active state", async () => {
    const { service, usersRepo } = setup();
    await expect(service.setUserActive("user-1", false)).resolves.toEqual({
      success: true,
      userId: "user-1",
      active: false,
    });
    expect(usersRepo.update).toHaveBeenCalledWith(
      { id: "user-1" },
      { isActive: false },
    );
  });

  it("throws when role operations target missing user", async () => {
    const { service, usersRepo } = setup();
    usersRepo.findOne.mockResolvedValue(null);

    await expect(service.getUserRoles("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.setUserRoles("missing", ["ADMIN"]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
