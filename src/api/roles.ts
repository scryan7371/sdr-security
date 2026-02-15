import { ADMIN_ROLE } from "./contracts";

export const normalizeRoleName = (value: string): string => {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (!normalized || !/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
    throw new Error("Invalid role name");
  }
  if (normalized === "ADMINISTRATOR") {
    return ADMIN_ROLE;
  }
  return normalized;
};

export const hasRole = (roles: string[], role: string) => {
  const normalizedRole = normalizeRoleName(role);
  return roles.some((assignedRole) => {
    try {
      return normalizeRoleName(assignedRole) === normalizedRole;
    } catch {
      return false;
    }
  });
};

export const isAdmin = (roles: string[]) => hasRole(roles, ADMIN_ROLE);
