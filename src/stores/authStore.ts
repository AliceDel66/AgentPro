import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getCurrentUser } from "../services/authService";
import type { AuthSession, AuthUser } from "../services/types";

type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous" | "error";

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  setSession: (session: AuthSession) => void;
  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;
  refreshCurrentUser: () => Promise<AuthUser | null>;
}

let currentUserRequest: Promise<AuthUser | null> | null = null;

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function getUserDisplayName(user: AuthUser | null) {
  return user?.name?.trim() || user?.email?.split("@")[0] || "未登录";
}

export function getUserAvatarInitial(user: AuthUser | null) {
  const displayName = getUserDisplayName(user);
  return displayName === "未登录" ? "U" : displayName.slice(0, 1).toUpperCase();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      status: "idle",
      error: null,
      setSession: (session) => {
        set({ user: session.user, status: "authenticated", error: null });
      },
      setUser: (user) => {
        set({ user, status: user ? "authenticated" : "anonymous", error: null });
      },
      clearUser: () => {
        set({ user: null, status: "anonymous", error: null });
      },
      refreshCurrentUser: () => {
        if (currentUserRequest) return currentUserRequest;

        set({ status: "loading", error: null });
        currentUserRequest = getCurrentUser()
          .then((result) => {
            set({ user: result.data, status: "authenticated", error: null });
            return result.data;
          })
          .catch((error) => {
            const message = readErrorMessage(error, "读取账号信息失败");
            set({ status: "error", error: message });
            return null;
          })
          .finally(() => {
            currentUserRequest = null;
          });

        return currentUserRequest;
      }
    }),
    {
      name: "agentpro.auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user })
    }
  )
);
