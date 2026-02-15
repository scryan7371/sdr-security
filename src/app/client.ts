import type {
  AuthResponse,
  DebugCodeResponse,
  DebugTokenResponse,
  RoleCatalogResponse,
  RegisterResponse,
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
    register: (payload: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    }) =>
      request<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    login: (payload: { email: string; password: string }) =>
      request<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    loginWithGoogle: (payload: { idToken: string }) =>
      request<AuthResponse>("/auth/login/google", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    refresh: (payload: { refreshToken: string }) =>
      request<AuthResponse>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    revoke: (payload: { refreshToken: string }) =>
      request<{ success: true }>("/auth/revoke", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    logout: (payload: { refreshToken?: string }) =>
      request<{ success: true }>("/auth/logout", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    requestEmailVerification: () =>
      request<DebugTokenResponse>("/auth/request-email-verification", {
        method: "POST",
      }),

    verifyEmail: (token: string) =>
      request<{ success: true }>(`/auth/verify-email?token=${token}`),

    requestPhoneVerification: () =>
      request<DebugCodeResponse>("/auth/request-phone-verification", {
        method: "POST",
      }),

    verifyPhone: (code: string) =>
      request<{ success: true }>("/auth/verify-phone", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),

    getMyRoles: () => request<UserRolesResponse>("/auth/me/roles"),

    listRoles: () => request<RoleCatalogResponse>("/admin/roles"),

    createRole: (payload: { role: string; description?: string | null }) =>
      request<RoleCatalogResponse>("/admin/roles", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    getUserRoles: (userId: string) =>
      request<UserRolesResponse>(`/admin/users/${userId}/roles`),

    setUserRoles: (userId: string, roles: string[]) =>
      request<UserRolesResponse>(`/admin/users/${userId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roles }),
      }),
  };
};
