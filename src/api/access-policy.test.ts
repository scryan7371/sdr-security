import { describe, expect, it } from "vitest";
import {
  accessBlockReasonToMessage,
  getAuthBlockReason,
} from "./access-policy";

const baseUser = {
  isActive: true,
  emailVerifiedAt: new Date(),
  phoneVerifiedAt: null,
  adminApprovedAt: new Date(),
};

describe("getAuthBlockReason", () => {
  it("returns null for user meeting default requirements", () => {
    expect(getAuthBlockReason(baseUser)).toBeNull();
  });

  it("blocks deactivated users first", () => {
    expect(
      getAuthBlockReason({
        ...baseUser,
        isActive: false,
        emailVerifiedAt: null,
        adminApprovedAt: null,
      }),
    ).toBe("ACCOUNT_DEACTIVATED");
  });

  it("blocks when email verification is required and missing", () => {
    expect(
      getAuthBlockReason({
        ...baseUser,
        emailVerifiedAt: null,
      }),
    ).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("does not block missing phone when phone verification is disabled", () => {
    expect(
      getAuthBlockReason({
        ...baseUser,
        phoneVerifiedAt: null,
      }),
    ).toBeNull();
  });

  it("blocks missing phone when phone verification is enabled", () => {
    expect(
      getAuthBlockReason(
        {
          ...baseUser,
          phoneVerifiedAt: null,
        },
        { requirePhoneVerification: true },
      ),
    ).toBe("PHONE_VERIFICATION_REQUIRED");
  });

  it("blocks when admin approval is required and missing", () => {
    expect(
      getAuthBlockReason({
        ...baseUser,
        adminApprovedAt: null,
      }),
    ).toBe("ADMIN_APPROVAL_REQUIRED");
  });

  it("respects disabled flags", () => {
    expect(
      getAuthBlockReason(
        {
          ...baseUser,
          isActive: false,
          emailVerifiedAt: null,
          adminApprovedAt: null,
        },
        {
          requireActive: false,
          requireEmailVerification: false,
          requireAdminApproval: false,
        },
      ),
    ).toBeNull();
  });
});

describe("accessBlockReasonToMessage", () => {
  it("maps each reason to expected message", () => {
    expect(accessBlockReasonToMessage("EMAIL_VERIFICATION_REQUIRED")).toBe(
      "Email verification required",
    );
    expect(accessBlockReasonToMessage("PHONE_VERIFICATION_REQUIRED")).toBe(
      "Phone verification required",
    );
    expect(accessBlockReasonToMessage("ADMIN_APPROVAL_REQUIRED")).toBe(
      "Admin approval required",
    );
    expect(accessBlockReasonToMessage("ACCOUNT_DEACTIVATED")).toBe(
      "Account deactivated",
    );
  });
});
