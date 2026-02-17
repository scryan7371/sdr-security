import { describe, expect, it, vi } from "vitest";
import {
  notifyAdminsOnEmailVerified,
  notifyUserOnAdminApproval,
} from "./notification-workflows";

describe("notification-workflows", () => {
  it("notifies admins when admin recipients exist", async () => {
    const listAdminEmails = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValue(["admin@example.com"]);
    const notifyAdmins = vi.fn().mockResolvedValue(undefined);

    const result = await notifyAdminsOnEmailVerified({
      user: {
        id: "user-1",
        email: "user@example.com",
        firstName: "User",
        lastName: "One",
      },
      listAdminEmails,
      notifyAdmins,
    });

    expect(result).toEqual({
      notified: true,
      adminEmails: ["admin@example.com"],
    });
    expect(notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        adminEmails: ["admin@example.com"],
        user: expect.objectContaining({ id: "user-1" }),
      }),
    );
  });

  it("skips admin notification when there are no admin recipients", async () => {
    const notifyAdmins = vi.fn().mockResolvedValue(undefined);

    const result = await notifyAdminsOnEmailVerified({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
      listAdminEmails: vi.fn().mockResolvedValue([]),
      notifyAdmins,
    });

    expect(result).toEqual({ notified: false, adminEmails: [] });
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("notifies user when account is approved", async () => {
    const notifyUser = vi.fn().mockResolvedValue(undefined);

    const result = await notifyUserOnAdminApproval({
      approved: true,
      user: { email: "user@example.com", firstName: "User" },
      notifyUser,
    });

    expect(result).toEqual({ notified: true });
    expect(notifyUser).toHaveBeenCalledWith({
      email: "user@example.com",
      firstName: "User",
    });
  });

  it("skips user notification when approval is false", async () => {
    const notifyUser = vi.fn().mockResolvedValue(undefined);

    const result = await notifyUserOnAdminApproval({
      approved: false,
      user: { email: "user@example.com" },
      notifyUser,
    });

    expect(result).toEqual({ notified: false });
    expect(notifyUser).not.toHaveBeenCalled();
  });
});
