import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
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
import type { AppRoute } from "./types";

export default function App() {
  const [route, setRoute] = useState<AppRoute>("login");
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null);
  const [activeSpecId, setActiveSpecId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);

  if (route === "register") return <RegisterPage navigate={setRoute} />;
  if (route === "forgot") return <ForgotPasswordPage navigate={setRoute} />;
  if (route === "setup") return <SetupPage navigate={setRoute} />;
  if (route !== "login") {
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

  return <LoginPage navigate={setRoute} />;
}
