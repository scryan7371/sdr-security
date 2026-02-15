export type AccessPolicyUser = {
  isActive: boolean;
  emailVerifiedAt: string | Date | null;
  phoneVerifiedAt?: string | Date | null;
  adminApprovedAt: string | Date | null;
};

export type AccessPolicyOptions = {
  requireEmailVerification?: boolean;
  requirePhoneVerification?: boolean;
  requireAdminApproval?: boolean;
  requireActive?: boolean;
};

export type AccessBlockReason =
  | "EMAIL_VERIFICATION_REQUIRED"
  | "PHONE_VERIFICATION_REQUIRED"
  | "ADMIN_APPROVAL_REQUIRED"
  | "ACCOUNT_DEACTIVATED";

const DEFAULT_OPTIONS: Required<AccessPolicyOptions> = {
  requireEmailVerification: true,
  requirePhoneVerification: false,
  requireAdminApproval: true,
  requireActive: true,
};

export const getAuthBlockReason = (
  user: AccessPolicyUser,
  options: AccessPolicyOptions = {},
): AccessBlockReason | null => {
  const effective = { ...DEFAULT_OPTIONS, ...options };

  if (effective.requireActive && !user.isActive) {
    return "ACCOUNT_DEACTIVATED";
  }

  if (effective.requireEmailVerification && !user.emailVerifiedAt) {
    return "EMAIL_VERIFICATION_REQUIRED";
  }

  if (effective.requirePhoneVerification && !user.phoneVerifiedAt) {
    return "PHONE_VERIFICATION_REQUIRED";
  }

  if (effective.requireAdminApproval && !user.adminApprovedAt) {
    return "ADMIN_APPROVAL_REQUIRED";
  }

  return null;
};

export const accessBlockReasonToMessage = (
  reason: AccessBlockReason,
): string => {
  switch (reason) {
    case "EMAIL_VERIFICATION_REQUIRED":
      return "Email verification required";
    case "PHONE_VERIFICATION_REQUIRED":
      return "Phone verification required";
    case "ADMIN_APPROVAL_REQUIRED":
      return "Admin approval required";
    case "ACCOUNT_DEACTIVATED":
      return "Account deactivated";
    default:
      return "Unauthorized";
  }
};
