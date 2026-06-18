import { apiGet, apiPost } from "./apiClient";
import type { AuthSession, AuthUser, EmailCodeResult } from "./types";

const mockUser: AuthUser = {
  id: "user_mock_001",
  name: "张明",
  email: "zhang@example.com",
  emailVerified: true
};

const mockSession: AuthSession = {
  user: mockUser,
  accessToken: "mock-access-token",
  refreshToken: "mock-refresh-token",
  tokenType: "bearer",
  expiresIn: 1800
};

export function loginWithPassword(identifier: string, password: string) {
  return apiPost("/auth/login", { identifier, password }, mockSession);
}

export function getCurrentUser() {
  return apiGet<AuthUser>("/auth/me", mockUser);
}

export function requestEmailCode(email: string, purpose: "register" | "reset" = "register") {
  return apiPost<{ email: string; purpose: "register" | "reset" }, EmailCodeResult>(
    "/auth/email-code",
    { email, purpose },
    { sent: true, cooldownSeconds: 60 }
  );
}

export function confirmPasswordReset(email: string, code: string, password: string) {
  return apiPost<{ email: string; code: string; password: string }, { reset: boolean }>(
    "/auth/password-reset/confirm",
    { email, code, password },
    { reset: true }
  );
}

export function registerWithEmail(email: string, code: string, password: string, name: string) {
  return apiPost("/auth/register", { email, code, password, name }, mockSession);
}

const ACCESS_TOKEN_KEY = "agentpro.accessToken";
const REFRESH_TOKEN_KEY = "agentpro.refreshToken";

export function persistAuthSession(session: AuthSession) {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
}

export function getAccessToken(): string | null {
  return globalThis.localStorage?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function clearAuthSession(): void {
  globalThis.localStorage?.removeItem(ACCESS_TOKEN_KEY);
  globalThis.localStorage?.removeItem(REFRESH_TOKEN_KEY);
}

export function refreshSession(refreshToken: string) {
  return apiPost("/auth/refresh", { refreshToken }, mockSession);
}

export function logoutSession(refreshToken: string) {
  return apiPost("/auth/logout", { refreshToken }, { loggedOut: true });
}
