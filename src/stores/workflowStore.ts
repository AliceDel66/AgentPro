import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface WorkflowState {
  activeRequirementId: string | null;
  activeSpecId: string | null;
  activeJobId: string | null;
  activeReviewId: string | null;
  setActiveRequirementId: (id: string | null) => void;
  setActiveSpecId: (id: string | null) => void;
  setActiveJobId: (id: string | null) => void;
  setActiveReviewId: (id: string | null) => void;
  resetWorkflow: () => void;
}

/**
 * Persists the active Agent-project context (requirement/spec/job/review) so a page
 * refresh keeps the user where they were instead of dropping the workflow.
 * Switching to a different requirement clears the downstream ids to avoid stale links.
 */
export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      activeRequirementId: null,
      activeSpecId: null,
      activeJobId: null,
      activeReviewId: null,
      setActiveRequirementId: (id) =>
        set((state) =>
          id === state.activeRequirementId
            ? { activeRequirementId: id }
            : { activeRequirementId: id, activeSpecId: null, activeJobId: null, activeReviewId: null }
        ),
      setActiveSpecId: (id) => set({ activeSpecId: id }),
      setActiveJobId: (id) => set({ activeJobId: id }),
      setActiveReviewId: (id) => set({ activeReviewId: id }),
      resetWorkflow: () =>
        set({ activeRequirementId: null, activeSpecId: null, activeJobId: null, activeReviewId: null })
    }),
    {
      name: "agentpro.workflow",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
