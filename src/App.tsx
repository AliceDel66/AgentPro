import { useEffect, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { Spinner } from "./components/common/Spinner";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { SetupPage } from "./pages/setup/SetupPage";
import { ChatPage } from "./pages/workspace/ChatPage";
import { DispatchPage } from "./pages/workspace/DispatchPage";
import { FollowupPage } from "./pages/workspace/FollowupPage";
import { LibraryPage } from "./pages/workspace/LibraryPage";
import { MonitorPage } from "./pages/workspace/MonitorPage";
import { ReviewPage } from "./pages/workspace/ReviewPage";
import { SettingsPage } from "./pages/workspace/SettingsPage";
import { SpecPage } from "./pages/workspace/SpecPage";
import { ShellPlaceholder } from "./pages/workspace/ShellPlaceholder";
import { useAuthStore } from "./stores/authStore";
import type { AppRoute } from "./types";

const AUTH_ROUTES: AppRoute[] = ["login", "register", "forgot"];

export default function App() {
  const [route, setRoute] = useState<AppRoute>("login");
  const [booted, setBooted] = useState(false);
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null);
  const [activeSpecId, setActiveSpecId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);

  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const authenticated = status === "authenticated";

  // Restore the session on startup so a refresh keeps the user logged in.
  useEffect(() => {
    void bootstrap().finally(() => setBooted(true));
  }, [bootstrap]);

  // Once restored, land an authenticated user in the workspace rather than the login page.
  useEffect(() => {
    if (booted && authenticated && route === "login") {
      setRoute("library");
    }
  }, [booted, authenticated, route]);

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
  if (!authenticated && !AUTH_ROUTES.includes(route)) {
    return <LoginPage navigate={setRoute} />;
  }

  if (route === "login") return <LoginPage navigate={setRoute} />;
  if (route === "register") return <RegisterPage navigate={setRoute} />;
  if (route === "forgot") return <ForgotPasswordPage navigate={setRoute} />;
  if (route === "setup") return <SetupPage navigate={setRoute} />;

  return (
    <AppShell navigate={setRoute} route={route}>
      {route === "chat" ? (
        <ChatPage activeRequirementId={activeRequirementId} navigate={setRoute} setActiveRequirementId={setActiveRequirementId} />
      ) : route === "followup" ? (
        <FollowupPage activeRequirementId={activeRequirementId} navigate={setRoute} />
      ) : route === "spec" ? (
        <SpecPage activeRequirementId={activeRequirementId} navigate={setRoute} setActiveSpecId={setActiveSpecId} />
      ) : route === "library" ? (
        <LibraryPage navigate={setRoute} setActiveRequirementId={setActiveRequirementId} />
      ) : route === "dispatch" ? (
        <DispatchPage activeRequirementId={activeRequirementId} activeSpecId={activeSpecId} navigate={setRoute} setActiveJobId={setActiveJobId} />
      ) : route === "monitor" ? (
        <MonitorPage activeJobId={activeJobId} navigate={setRoute} />
      ) : route === "review" ? (
        <ReviewPage activeJobId={activeJobId} activeReviewId={activeReviewId} activeSpecId={activeSpecId} navigate={setRoute} setActiveReviewId={setActiveReviewId} />
      ) : route === "settings" ? (
        <SettingsPage navigate={setRoute} />
      ) : (
        <ShellPlaceholder route={route} />
      )}
    </AppShell>
  );
}
