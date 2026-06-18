import { Check } from "lucide-react";
import { canEnterWorkflowRoute, lockedWorkflowReason, WORKFLOW_STEPS, workflowStepIndexForRoute } from "../../lib/workflow";
import { useWorkflowStore } from "../../stores/workflowStore";
import type { AppRoute, Navigate } from "../../types";

interface WorkflowStepperProps {
  route: AppRoute;
  navigate: Navigate;
}

/**
 * Top-of-workspace stage bar: 需求访谈 → 需求草案 → 开发调度 → 并行监控 → 自动评审.
 * Highlights the stage the current route belongs to; renders nothing outside the flow.
 */
export function WorkflowStepper({ route, navigate }: WorkflowStepperProps) {
  const currentIndex = workflowStepIndexForRoute(route);
  const activeRequirementId = useWorkflowStore((state) => state.activeRequirementId);
  const activeSpecId = useWorkflowStore((state) => state.activeSpecId);
  const activeJobId = useWorkflowStore((state) => state.activeJobId);
  const activeJobStatus = useWorkflowStore((state) => state.activeJobStatus);
  const activeReviewId = useWorkflowStore((state) => state.activeReviewId);
  const workflowContext = { activeRequirementId, activeSpecId, activeJobId, activeJobStatus, activeReviewId };

  if (currentIndex < 0) return null;

  return (
    <div className="flex items-center gap-1" role="navigation" aria-label="开发流程进度">
      {WORKFLOW_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const lockedReason = lockedWorkflowReason(step.primaryRoute, workflowContext);
        const unlocked = canEnterWorkflowRoute(step.primaryRoute, workflowContext);
        return (
          <div className="flex items-center gap-1" key={step.key}>
            <button
              type="button"
              aria-current={active ? "step" : undefined}
              disabled={!unlocked}
              title={lockedReason ?? step.label}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                active
                  ? "bg-agent-pale text-agent-primary"
                  : unlocked
                    ? "text-agent-subtle hover:bg-[#F0F4FA] hover:text-agent-secondary"
                    : "cursor-not-allowed text-agent-subtle opacity-55"
              }`}
              onClick={() => {
                if (unlocked) navigate(step.primaryRoute);
              }}
            >
              <span
                className={`grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold ${
                  active
                    ? "bg-agent-primary text-white ring-2 ring-agent-pale"
                    : done
                      ? "bg-agent-primary text-white"
                      : "bg-agent-divider text-agent-subtle"
                }`}
              >
                {done ? <Check size={11} strokeWidth={3} /> : index + 1}
              </span>
              {step.label}
            </button>
            {index < WORKFLOW_STEPS.length - 1 ? (
              <div className={`h-px w-4 ${done ? "bg-agent-primary" : "bg-agent-border"}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
