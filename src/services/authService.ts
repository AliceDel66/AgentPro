import { apiPost } from "./apiClient";
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

export function requestEmailCode(email: string) {
  return apiPost<object, EmailCodeResult>("/auth/email-code", { email }, { sent: true, cooldownSeconds: 60 });
}

export function registerWithEmail(email: string, code: string, password: string, name: string) {
  return apiPost("/auth/register", { email, code, password, name }, mockSession);
}

export function refreshSession(refreshToken: string) {
  return apiPost("/auth/refresh", { refreshToken }, mockSession);
}

export function logoutSession(refreshToken: string) {
  return apiPost("/auth/logout", { refreshToken }, { loggedOut: true });
}
