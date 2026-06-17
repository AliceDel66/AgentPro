import { apiPost } from "./apiClient";
import type { AuthUser } from "./types";

const mockUser: AuthUser = {
  id: "user_mock_001",
  name: "张明",
  email: "zhang@example.com",
  emailVerified: true
};

export function loginWithPassword(identifier: string, password: string) {
  return apiPost("/auth/login", { identifier, password }, mockUser);
}

export function requestEmailCode(email: string) {
  return apiPost("/auth/email-code", { email }, { sent: true, cooldownSeconds: 60 });
}

export function registerWithEmail(email: string, code: string, password: string, name: string) {
  return apiPost("/auth/register", { email, code, password, name }, mockUser);
}
