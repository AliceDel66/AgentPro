import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface RunnerSettingsState {
  workspaceRoot: string | null;
  setWorkspaceRoot: (path: string | null) => void;
  resetWorkspaceRoot: () => void;
}

export const FALLBACK_RUNNER_WORKSPACE_ROOT = "~/AgentPro/runs";

export const useRunnerSettingsStore = create<RunnerSettingsState>()(
  persist(
    (set) => ({
      workspaceRoot: null,
      setWorkspaceRoot: (path) => set({ workspaceRoot: path?.trim() || null }),
      resetWorkspaceRoot: () => set({ workspaceRoot: null })
    }),
    {
      name: "agentpro.runner-settings",
      storage: createJSONStorage(() => localStorage)
    }
  )
);

export function getStoredRunnerWorkspaceRoot() {
  return useRunnerSettingsStore.getState().workspaceRoot;
}
