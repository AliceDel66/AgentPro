import type { AppRoute } from "../types";

export interface WorkflowStep {
  key: string;
  label: string;
  /** Routes that belong to this stage (used to highlight the stepper). */
  routes: AppRoute[];
  /** Route the step jumps to when clicked. */
  primaryRoute: AppRoute;
}

/** Linear product flow shown in the top stage bar. */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  { key: "intake", label: "需求访谈", routes: ["chat", "followup"], primaryRoute: "chat" },
  { key: "spec", label: "需求草案", routes: ["spec"], primaryRoute: "spec" },
  { key: "dispatch", label: "开发调度", routes: ["dispatch"], primaryRoute: "dispatch" },
  { key: "monitor", label: "并行监控", routes: ["monitor"], primaryRoute: "monitor" },
  { key: "review", label: "自动评审", routes: ["review"], primaryRoute: "review" }
];

/** Index of the stage the given route belongs to, or -1 if the route is outside the flow. */
export function workflowStepIndexForRoute(route: AppRoute): number {
  return WORKFLOW_STEPS.findIndex((step) => step.routes.includes(route));
}

export interface NextAction {
  label: string;
  route: AppRoute;
}

/** The single "what to do next" action for a requirement, derived from its backend status. */
export function nextActionForStatus(status: string): NextAction {
  switch (status) {
    case "interviewing":
      return { label: "继续访谈", route: "chat" };
    case "ready_for_spec":
      return { label: "生成草案", route: "spec" };
    case "spec_draft":
      return { label: "去审批", route: "spec" };
    case "approved":
      return { label: "去开发", route: "dispatch" };
    case "archived":
      return { label: "查看归档", route: "chat" };
    default:
      return { label: "继续", route: "chat" };
  }
}
