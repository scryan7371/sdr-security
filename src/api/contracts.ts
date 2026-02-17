export const ADMIN_ROLE = "ADMIN";
export type UserRole = string;

export type SafeUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  roles: UserRole[];
  emailVerifiedAt: string | Date | null;
  phoneVerifiedAt: string | Date | null;
  adminApprovedAt: string | Date | null;
  isActive: boolean;
};

export type UserRolesResponse = {
  userId: string;
  roles: UserRole[];
};

export type RoleDefinition = {
  role: UserRole;
  description: string | null;
  isSystem: boolean;
};

export type RoleCatalogResponse = {
  roles: RoleDefinition[];
};

export type AuthResponse = {
  accessToken: string;
  accessTokenExpiresIn: string;
  refreshToken: string;
  refreshTokenExpiresAt: string | Date;
  user: SafeUser;
};

export type RegisterResponse = {
  success: true;
  user: SafeUser;
  debugToken?: string;
};

export type DebugTokenResponse = { success: true; debugToken?: string };
export type DebugCodeResponse = { success: true; debugCode?: string };

export type GenericSuccessResponse = { success: true };
export type UserActiveResponse = {
  success: true;
  userId: string;
  active: boolean;
};
export type AdminNotificationResponse = {
  success: true;
  notified: boolean;
};
