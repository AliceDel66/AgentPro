import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { BackendContractGate } from "./components/common/BackendContractGate";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { Spinner } from "./components/common/Spinner";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { SetupPage } from "./pages/setup/SetupPage";
import { AgentsPage } from "./pages/workspace/AgentsPage";
import { AgentRunPage } from "./pages/workspace/AgentRunPage";
import { ChatPage } from "./pages/workspace/ChatPage";
import { DispatchPage } from "./pages/workspace/DispatchPage";
import { FollowupPage } from "./pages/workspace/FollowupPage";
import { LibraryPage } from "./pages/workspace/LibraryPage";
import { MonitorPage } from "./pages/workspace/MonitorPage";
import { ReportsPage } from "./pages/workspace/ReportsPage";
import { ReviewPage } from "./pages/workspace/ReviewPage";
import { SettingsPage } from "./pages/workspace/SettingsPage";
import { SpecPage } from "./pages/workspace/SpecPage";
import { ShellPlaceholder } from "./pages/workspace/ShellPlaceholder";
import { canEnterWorkflowRoute, fallbackRouteForLockedWorkflow } from "./lib/workflow";
import { evaluateBackendContract, getBackendHealth, type BackendContractCheck } from "./services/healthService";
import { useAuthStore } from "./stores/authStore";
import { useWorkflowStore } from "./stores/workflowStore";
import type { DeliveredAgent } from "./services/types";
import type { AppRoute } from "./types";

const AUTH_ROUTES: AppRoute[] = ["login", "register", "forgot"];

type ContractState =
  | { status: "checking" }
  | { status: "compatible"; check: BackendContractCheck }
  | { status: "blocked"; check: BackendContractCheck };

export default function App() {
  const [route, setRoute] = useState<AppRoute>("login");
  const [booted, setBooted] = useState(false);
  const [contractState, setContractState] = useState<ContractState>({ status: "checking" });
  const [activeAgent, setActiveAgent] = useState<DeliveredAgent | null>(null);
  // Workflow context is persisted in the store so a refresh keeps the active project.
  const activeRequirementId = useWorkflowStore((state) => state.activeRequirementId);
  const activeSpecId = useWorkflowStore((state) => state.activeSpecId);
  const activeJobId = useWorkflowStore((state) => state.activeJobId);
  const activeJobStatus = useWorkflowStore((state) => state.activeJobStatus);
  const activeReviewId = useWorkflowStore((state) => state.activeReviewId);
  const activeReviewTab = useWorkflowStore((state) => state.activeReviewTab);
  const setActiveRequirementId = useWorkflowStore((state) => state.setActiveRequirementId);
  const setActiveSpecId = useWorkflowStore((state) => state.setActiveSpecId);
  const setActiveJobId = useWorkflowStore((state) => state.setActiveJobId);
  const setActiveJobStatus = useWorkflowStore((state) => state.setActiveJobStatus);
  const setActiveReviewId = useWorkflowStore((state) => state.setActiveReviewId);
  const setActiveReviewTab = useWorkflowStore((state) => state.setActiveReviewTab);

  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const authLoading = status === "idle" || status === "loading";
  const authenticated = status === "authenticated" || Boolean(user && (status === "loading" || status === "error"));
  const workflowContext = { activeRequirementId, activeSpecId, activeJobId, activeJobStatus, activeReviewId };

  const guardedNavigate = (nextRoute: AppRoute) => {
    if (!canEnterWorkflowRoute(nextRoute, workflowContext)) {
      setRoute(fallbackRouteForLockedWorkflow(nextRoute, workflowContext));
      return;
    }
    setRoute(nextRoute);
  };

  const runStartupCheck = useCallback(async () => {
    setBooted(false);
    setContractState({ status: "checking" });
    try {
      const result = await getBackendHealth();
      const check = evaluateBackendContract(result.data);
      if (!check.compatible) {
        setContractState({ status: "blocked", check });
        return;
      }
      setContractState({ status: "compatible", check });
      await bootstrap().catch((error) => {
        console.error("[AgentPro] 恢复登录状态失败", error);
      });
      setBooted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法连接远端后端服务，请确认服务器健康状态和当前网络后重试。";
      setContractState({
        status: "blocked",
        check: {
          compatible: false,
          title: "无法连接远端后端服务",
          message,
          issues: [
            {
              code: "backend_unreachable",
              message: "桌面端无法读取远端 /api/v1/health，请确认服务器部署正常、网络可达，或等待自动部署完成后重试。"
            }
          ],
          health: null
        }
      });
    }
  }, [bootstrap]);

  // Restore the session only after the backend/desktop contract is verified.
  useEffect(() => {
    void runStartupCheck();
  }, [runStartupCheck]);

  // Once restored, land an authenticated user in the workspace rather than the login page.
  useEffect(() => {
    if (booted && authenticated && route === "login") {
      setRoute("chat");
    }
  }, [booted, authenticated, route]);

  useEffect(() => {
    if (!booted || !authenticated || AUTH_ROUTES.includes(route)) return;
    if (!canEnterWorkflowRoute(route, workflowContext)) {
      setRoute(fallbackRouteForLockedWorkflow(route, workflowContext));
    }
  }, [authenticated, booted, route, activeRequirementId, activeSpecId, activeJobId, activeJobStatus, activeReviewId]);

  if (contractState.status === "checking") {
    return <BackendContractGate checking onRetry={runStartupCheck} />;
  }

  if (contractState.status === "blocked") {
    return <BackendContractGate check={contractState.check} onRetry={runStartupCheck} />;
  }

  if (!booted) {
    return (
      <div className="grid h-screen w-full place-items-center bg-agent-bg">
        <div className="flex items-center gap-3 text-sm text-agent-muted">
          <Spinner size={20} className="text-agent-primary" />
          正在恢复登录状态...
        </div>
      </div>
    );
  }

  // Auth guard: unauthenticated users may only see the auth screens.
  if (!authenticated && authLoading && !AUTH_ROUTES.includes(route)) {
    return (
      <div className="grid h-screen w-full place-items-center bg-agent-bg">
        <div className="flex items-center gap-3 text-sm text-agent-muted">
          <Spinner size={20} className="text-agent-primary" />
          正在恢复登录状态...
        </div>
      </div>
    );
  }

  if (!authenticated && !AUTH_ROUTES.includes(route)) {
    return <LoginPage navigate={setRoute} />;
  }

  if (route === "login") return <LoginPage navigate={setRoute} />;
  if (route === "register") return <RegisterPage navigate={setRoute} />;
  if (route === "forgot") return <ForgotPasswordPage navigate={setRoute} />;
  if (route === "setup") return <SetupPage navigate={guardedNavigate} />;

  return (
    <AppShell navigate={guardedNavigate} route={route}>
      <ErrorBoundary onReset={() => setRoute("chat")}>
        {route === "chat" ? (
          <ChatPage
            activeRequirementId={activeRequirementId}
            navigate={guardedNavigate}
            setActiveRequirementId={setActiveRequirementId}
          />
        ) : route === "followup" ? (
          <FollowupPage activeRequirementId={activeRequirementId} navigate={guardedNavigate} />
        ) : route === "spec" ? (
          <SpecPage activeRequirementId={activeRequirementId} navigate={guardedNavigate} setActiveSpecId={setActiveSpecId} />
        ) : route === "library" ? (
          <LibraryPage
            navigate={guardedNavigate}
            setActiveJobId={setActiveJobId}
            setActiveJobStatus={setActiveJobStatus}
            setActiveRequirementId={setActiveRequirementId}
            setActiveReviewId={setActiveReviewId}
            setActiveReviewTab={setActiveReviewTab}
            setActiveSpecId={setActiveSpecId}
          />
        ) : route === "dispatch" ? (
          <DispatchPage
            activeRequirementId={activeRequirementId}
            activeSpecId={activeSpecId}
            navigate={guardedNavigate}
            setActiveJobId={setActiveJobId}
            setActiveJobStatus={setActiveJobStatus}
          />
        ) : route === "monitor" ? (
          <MonitorPage activeJobId={activeJobId} activeSpecId={activeSpecId} navigate={guardedNavigate} setActiveJobStatus={setActiveJobStatus} />
        ) : route === "review" ? (
          <ReviewPage
            activeJobId={activeJobId}
            activeReviewId={activeReviewId}
            activeReviewTab={activeReviewTab}
            activeSpecId={activeSpecId}
            navigate={guardedNavigate}
            setActiveJobId={setActiveJobId}
            setActiveJobStatus={setActiveJobStatus}
            setActiveReviewId={setActiveReviewId}
            setActiveReviewTab={setActiveReviewTab}
          />
        ) : route === "reports" ? (
          <ReportsPage
            navigate={guardedNavigate}
            setActiveJobId={setActiveJobId}
            setActiveJobStatus={setActiveJobStatus}
            setActiveReviewId={setActiveReviewId}
            setActiveReviewTab={setActiveReviewTab}
          />
        ) : route === "agents" ? (
          <AgentsPage navigate={guardedNavigate} setActiveAgent={setActiveAgent} />
        ) : route === "agentRun" ? (
          <AgentRunPage agent={activeAgent} navigate={guardedNavigate} />
        ) : route === "settings" ? (
          <SettingsPage navigate={guardedNavigate} />
        ) : (
          <ShellPlaceholder route={route} />
        )}
      </ErrorBoundary>
    </AppShell>
  );
}
