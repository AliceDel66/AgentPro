import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface WorkflowState {
  activeRequirementId: string | null;
  activeSpecId: string | null;
  activeJobId: string | null;
  activeJobStatus: string | null;
  activeReviewId: string | null;
  activeReviewTab: "overview" | "details" | "evidence" | "plan";
  setActiveRequirementId: (id: string | null) => void;
  setActiveSpecId: (id: string | null) => void;
  setActiveJobId: (id: string | null) => void;
  setActiveJobStatus: (status: string | null) => void;
  setActiveReviewId: (id: string | null) => void;
  setActiveReviewTab: (tab: WorkflowState["activeReviewTab"]) => void;
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
      activeJobStatus: null,
      activeReviewId: null,
      activeReviewTab: "overview",
      setActiveRequirementId: (id) =>
        set((state) =>
          id === state.activeRequirementId
            ? { activeRequirementId: id }
            : { activeRequirementId: id, activeSpecId: null, activeJobId: null, activeJobStatus: null, activeReviewId: null, activeReviewTab: "overview" }
        ),
      setActiveSpecId: (id) => set({ activeSpecId: id }),
      setActiveJobId: (id) =>
        set((state) =>
          id === state.activeJobId
            ? { activeJobId: id }
            : { activeJobId: id, activeJobStatus: null, activeReviewId: null, activeReviewTab: "overview" }
        ),
      setActiveJobStatus: (status) => set({ activeJobStatus: status }),
      setActiveReviewId: (id) => set({ activeReviewId: id }),
      setActiveReviewTab: (tab) => set({ activeReviewTab: tab }),
      resetWorkflow: () =>
        set({ activeRequirementId: null, activeSpecId: null, activeJobId: null, activeJobStatus: null, activeReviewId: null, activeReviewTab: "overview" })
    }),
    {
      name: "agentpro.workflow",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
