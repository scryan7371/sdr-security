import type {SocialAuthOptions} from "./security-social.options";
export type SecurityAuthModuleOptions = {
  jwtSecret: string;
  social?: SocialAuthOptions;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresInDays?: number;
  requireEmailVerification?: boolean;
  requireAdminApproval?: boolean;
  passwordResetTokenExpiresInMinutes?: number;
};
