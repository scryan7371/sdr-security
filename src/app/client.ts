import type {
  AdminNotificationResponse,
  AuthResponse,
  DebugCodeResponse,
  DebugTokenResponse,
  GenericSuccessResponse,
  RoleCatalogResponse,
  RegisterResponse,
  UserActiveResponse,
  UserRolesResponse,
} from "../api/contracts";

type FetchLike = typeof fetch;

export type SecurityClientOptions = {
  baseUrl: string;
  getAccessToken: () => string | null;
  fetchImpl?: FetchLike;
};

export const createSecurityClient = (options: SecurityClientOptions) => {
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const token = options.getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers ? (init.headers as Record<string, string>) : {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchImpl(`${options.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message =
        typeof body?.message === "string"
          ? body.message
          : `Request failed: ${response.status}`;
      throw new Error(message);
    }

    return body as T;
  };

  return {
    register: (payload: { email: string; password: string }) =>
      request<RegisterResponse>("/security/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    login: (payload: { email: string; password: string }) =>
      request<AuthResponse>("/security/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    loginWithGoogle: (payload: { idToken: string }) =>
      request<AuthResponse>("/auth/login/google", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    refresh: (payload: { refreshToken: string }) =>
      request<AuthResponse>("/security/auth/refresh", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    revoke: (payload: { refreshToken: string }) =>
      request<{ success: true }>("/auth/revoke", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    logout: (payload: { refreshToken?: string }) =>
      request<{ success: true }>("/security/auth/logout", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    changePassword: (payload: {
      currentPassword: string;
      newPassword: string;
    }) =>
      request<GenericSuccessResponse>("/security/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    verifyEmail: (token: string) =>
      request<{ success: true }>(
        `/security/auth/verify-email?token=${encodeURIComponent(token)}`,
      ),

    forgotPassword: (email: string) =>
      request<GenericSuccessResponse>("/security/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    resetPassword: (payload: { token: string; newPassword: string }) =>
      request<GenericSuccessResponse>("/security/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    requestPhoneVerification: () =>
      request<DebugCodeResponse>("/auth/request-phone-verification", {
        method: "POST",
      }),

    verifyPhone: (code: string) =>
      request<{ success: true }>("/auth/verify-phone", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),

    getMyRoles: () => request<UserRolesResponse>("/security/auth/me/roles"),

    listRoles: () => request<RoleCatalogResponse>("/security/workflows/roles"),

    createRole: (payload: { role: string; description?: string | null }) =>
      request<RoleCatalogResponse>("/security/workflows/roles", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    getUserRoles: (userId: string) =>
      request<UserRolesResponse>(`/security/workflows/users/${userId}/roles`),

    setUserRoles: (userId: string, roles: string[]) =>
      request<UserRolesResponse>(`/security/workflows/users/${userId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roles }),
      }),

    approveUser: (userId: string, approved: boolean) =>
      request<AdminNotificationResponse>(
        `/security/workflows/users/${userId}/admin-approval`,
        {
          method: "PATCH",
          body: JSON.stringify({ approved }),
        },
      ),

    setUserActive: (userId: string, active: boolean) =>
      request<UserActiveResponse>(
        `/security/workflows/users/${userId}/active`,
        {
          method: "PATCH",
          body: JSON.stringify({ active }),
        },
      ),

    removeRole: (role: string) =>
      request<{ success: boolean }>(
        `/security/workflows/roles/${encodeURIComponent(role)}`,
        {
          method: "DELETE",
        },
      ),

    assignRoleToUser: (userId: string, role: string) =>
      request<UserRolesResponse>(`/security/workflows/users/${userId}/roles`, {
        method: "POST",
        body: JSON.stringify({ role }),
      }),

    removeRoleFromUser: (userId: string, role: string) =>
      request<UserRolesResponse>(
        `/security/workflows/users/${userId}/roles/${encodeURIComponent(role)}`,
        {
          method: "DELETE",
        },
      ),
  };
};
