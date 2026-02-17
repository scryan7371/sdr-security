import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityWorkflowsController } from "./security-workflows.controller";

const makeService = () => ({
  markEmailVerifiedAndNotifyAdmins: vi.fn(),
  setAdminApprovalAndNotifyUser: vi.fn(),
  setUserActive: vi.fn(),
  listRoles: vi.fn(),
  createRole: vi.fn(),
  removeRole: vi.fn(),
  getUserRoles: vi.fn(),
  setUserRoles: vi.fn(),
  assignRoleToUser: vi.fn(),
  removeRoleFromUser: vi.fn(),
});

describe("SecurityWorkflowsController", () => {
  let service: ReturnType<typeof makeService>;
  let controller: SecurityWorkflowsController;

  beforeEach(() => {
    service = makeService();
    controller = new SecurityWorkflowsController(service as never);
  });

  it("marks email verified", async () => {
    service.markEmailVerifiedAndNotifyAdmins.mockResolvedValue({
      success: true,
    });
    await expect(controller.markEmailVerified("u1")).resolves.toEqual({
      success: true,
    });
  });

  it("validates admin approval and active payload", async () => {
    await expect(controller.setAdminApproval("u1", {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.setUserActive("u1", {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("delegates admin approval and active updates", async () => {
    service.setAdminApprovalAndNotifyUser.mockResolvedValue({ success: true });
    service.setUserActive.mockResolvedValue({ success: true });

    await controller.setAdminApproval("u1", { approved: true });
    await controller.setUserActive("u1", { active: false });

    expect(service.setAdminApprovalAndNotifyUser).toHaveBeenCalledWith(
      "u1",
      true,
    );
    expect(service.setUserActive).toHaveBeenCalledWith("u1", false);
  });

  it("lists and creates roles", async () => {
    service.listRoles.mockResolvedValue([{ role: "ADMIN" }]);
    service.createRole.mockResolvedValue([
      { role: "ADMIN" },
      { role: "COACH" },
    ]);

    await expect(controller.listRoles()).resolves.toEqual({
      roles: [{ role: "ADMIN" }],
    });

    await expect(
      controller.createRole({ role: "coach", description: null }),
    ).resolves.toEqual({ roles: [{ role: "ADMIN" }, { role: "COACH" }] });

    await expect(controller.createRole({ role: "   " })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("delegates role assignment and removal", async () => {
    service.removeRole.mockResolvedValue({ success: true });
    service.getUserRoles.mockResolvedValue({ userId: "u1", roles: ["ADMIN"] });
    service.setUserRoles.mockResolvedValue({ userId: "u1", roles: ["ADMIN"] });
    service.assignRoleToUser.mockResolvedValue({
      userId: "u1",
      roles: ["ADMIN"],
    });
    service.removeRoleFromUser.mockResolvedValue({ userId: "u1", roles: [] });

    await expect(controller.removeRole("ADMIN")).resolves.toEqual({
      success: true,
    });
    await expect(controller.getUserRoles("u1")).resolves.toEqual({
      userId: "u1",
      roles: ["ADMIN"],
    });
    await expect(
      controller.setUserRoles("u1", { roles: ["ADMIN"] }),
    ).resolves.toEqual({
      userId: "u1",
      roles: ["ADMIN"],
    });
    await expect(
      controller.assignUserRole("u1", { role: "ADMIN" }),
    ).resolves.toEqual({ userId: "u1", roles: ["ADMIN"] });
    await expect(controller.removeUserRole("u1", "ADMIN")).resolves.toEqual({
      userId: "u1",
      roles: [],
    });
  });

  it("validates role array and role string", async () => {
    await expect(
      controller.setUserRoles("u1", { roles: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.assignUserRole("u1", {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
