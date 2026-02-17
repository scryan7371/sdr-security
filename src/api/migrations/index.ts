import { AddRefreshTokens1700000000001 } from "./1700000000001-add-refresh-tokens";
import { AddGoogleSubjectToUser1739490000000 } from "./1739490000000-add-google-subject-to-user";
import { CreateSecurityIdentity1739500000000 } from "./1739500000000-create-security-identity";
import { CreateSecurityRoles1739510000000 } from "./1739510000000-create-security-roles";
import { CreatePasswordResetTokens1739520000000 } from "./1739520000000-create-password-reset-tokens";

export const securityMigrations = [
  AddRefreshTokens1700000000001,
  AddGoogleSubjectToUser1739490000000,
  CreateSecurityIdentity1739500000000,
  CreateSecurityRoles1739510000000,
  CreatePasswordResetTokens1739520000000,
];

export {
  AddRefreshTokens1700000000001,
  AddGoogleSubjectToUser1739490000000,
  CreateSecurityIdentity1739500000000,
  CreateSecurityRoles1739510000000,
  CreatePasswordResetTokens1739520000000,
};
