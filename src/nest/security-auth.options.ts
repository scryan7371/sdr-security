export type SecurityAuthModuleOptions = {
  jwtSecret: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresInDays?: number;
  requireEmailVerification?: boolean;
  requireAdminApproval?: boolean;
  passwordResetTokenExpiresInMinutes?: number;
};
