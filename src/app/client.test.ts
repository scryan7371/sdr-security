import { describe, expect, it, vi } from "vitest";
import { createSecurityClient } from "./client";

type MockResponse = { ok: boolean; status: number; body: unknown };

const makeFetch = (responses: MockResponse[]) => {
  const fn = vi.fn();
  responses.forEach((response) => {
    fn.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status,
      text: async () =>
        response.body === undefined ? "" : JSON.stringify(response.body),
    });
  });
  return fn;
};

describe("createSecurityClient", () => {
  it("sends auth header and JSON body", async () => {
    const fetchImpl = makeFetch([
      { ok: true, status: 200, body: { success: true } },
    ]);
    const client = createSecurityClient({
      baseUrl: "https://api.example.com",
      getAccessToken: () => "token-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.register({
      email: "user@example.com",
      password: "Secret123",
      firstName: "A",
      lastName: "B",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/security/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("omits auth header when token is missing", async () => {
    const fetchImpl = makeFetch([
      { ok: true, status: 200, body: { success: true } },
    ]);
    const client = createSecurityClient({
      baseUrl: "https://api.example.com",
      getAccessToken: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.logout({});

    const headers = (
      fetchImpl.mock.calls[0][1] as { headers: Record<string, string> }
    ).headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it("throws server-provided error message", async () => {
    const fetchImpl = makeFetch([
      { ok: false, status: 400, body: { message: "bad request" } },
    ]);
    const client = createSecurityClient({
      baseUrl: "https://api.example.com",
      getAccessToken: () => "token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.login({ email: "x", password: "y" })).rejects.toThrow(
      "bad request",
    );
  });

  it("throws fallback error when server does not return message", async () => {
    const fetchImpl = makeFetch([
      { ok: false, status: 503, body: { detail: "down" } },
    ]);
    const client = createSecurityClient({
      baseUrl: "https://api.example.com",
      getAccessToken: () => "token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.listRoles()).rejects.toThrow("Request failed: 503");
  });

  it("encodes URL params correctly", async () => {
    const fetchImpl = makeFetch([
      { ok: true, status: 200, body: { success: true } },
      { ok: true, status: 200, body: { success: true } },
      { ok: true, status: 200, body: { success: true } },
    ]);
    const client = createSecurityClient({
      baseUrl: "https://api.example.com",
      getAccessToken: () => "token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.verifyEmail("a b+c");
    await client.removeRole("ADMIN TEAM");
    await client.removeRoleFromUser("u1", "ADMIN TEAM");

    expect(fetchImpl.mock.calls[0][0]).toContain("token=a%20b%2Bc");
    expect(fetchImpl.mock.calls[1][0]).toContain("roles/ADMIN%20TEAM");
    expect(fetchImpl.mock.calls[2][0]).toContain("roles/ADMIN%20TEAM");
  });

  it("supports auth and workflow operations", async () => {
    const responses = Array.from({ length: 18 }, () => ({
      ok: true,
      status: 200,
      body: { success: true },
    }));
    const fetchImpl = makeFetch(responses);
    const client = createSecurityClient({
      baseUrl: "https://api.example.com",
      getAccessToken: () => "token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.login({ email: "u@e.com", password: "Secret123" });
    await client.loginWithGoogle({ idToken: "id-token" });
    await client.refresh({ refreshToken: "rt" });
    await client.revoke({ refreshToken: "rt" });
    await client.changePassword({ currentPassword: "a", newPassword: "b" });
    await client.forgotPassword("u@e.com");
    await client.resetPassword({ token: "t", newPassword: "Secret123" });
    await client.requestPhoneVerification();
    await client.verifyPhone("123456");
    await client.getMyRoles();
    await client.listRoles();
    await client.createRole({ role: "COACH", description: null });
    await client.getUserRoles("u1");
    await client.setUserRoles("u1", ["ADMIN"]);
    await client.approveUser("u1", true);
    await client.setUserActive("u1", true);
    await client.assignRoleToUser("u1", "ADMIN");
    await client.removeRoleFromUser("u1", "ADMIN");

    expect(fetchImpl).toHaveBeenCalledTimes(18);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([
        "https://api.example.com/auth/login/google",
        "https://api.example.com/auth/revoke",
        "https://api.example.com/auth/request-phone-verification",
        "https://api.example.com/auth/verify-phone",
        "https://api.example.com/security/workflows/users/u1/admin-approval",
      ]),
    );
  });
});
