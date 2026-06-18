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

export const TERMINAL_JOB_STATUSES = new Set(["completed", "completed_with_warnings", "failed", "blocked"]);

export interface WorkflowContext {
  activeRequirementId: string | null;
  activeSpecId: string | null;
  activeJobId: string | null;
  activeJobStatus: string | null;
  activeReviewId?: string | null;
}

export function canEnterWorkflowRoute(route: AppRoute, context: WorkflowContext): boolean {
  switch (route) {
    case "spec":
      return Boolean(context.activeRequirementId);
    case "dispatch":
      return Boolean(context.activeSpecId);
    case "monitor":
      return Boolean(context.activeJobId);
    case "review":
      return Boolean(context.activeReviewId || (context.activeJobId && context.activeJobStatus && TERMINAL_JOB_STATUSES.has(context.activeJobStatus)));
    default:
      return true;
  }
}

export function lockedWorkflowReason(route: AppRoute, context: WorkflowContext): string | null {
  if (canEnterWorkflowRoute(route, context)) return null;
  switch (route) {
    case "spec":
      return "请先选择或创建需求";
    case "dispatch":
      return "请先生成并确认 AgentSpec";
    case "monitor":
      return "请先从开发调度创建任务";
    case "review":
      return context.activeJobId ? "请等待开发任务结束" : "请先创建开发任务";
    default:
      return null;
  }
}

export function fallbackRouteForLockedWorkflow(route: AppRoute, context: WorkflowContext): AppRoute {
  switch (route) {
    case "spec":
      return context.activeRequirementId ? "spec" : "library";
    case "dispatch":
      return context.activeRequirementId ? "spec" : "library";
    case "monitor":
      return context.activeSpecId ? "dispatch" : "library";
    case "review":
      return context.activeJobId ? "monitor" : context.activeSpecId ? "dispatch" : "library";
    default:
      return route;
  }
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
