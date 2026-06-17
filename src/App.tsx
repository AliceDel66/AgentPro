import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { SetupPage } from "./pages/setup/SetupPage";
import { ChatPage } from "./pages/workspace/ChatPage";
import { ShellPlaceholder } from "./pages/workspace/ShellPlaceholder";
import type { AppRoute } from "./types";

export default function App() {
  const [route, setRoute] = useState<AppRoute>("login");

  if (route === "register") return <RegisterPage navigate={setRoute} />;
  if (route === "forgot") return <ForgotPasswordPage navigate={setRoute} />;
  if (route === "setup") return <SetupPage navigate={setRoute} />;
  if (route !== "login") {
    return (
      <AppShell navigate={setRoute} route={route}>
        {route === "chat" ? <ChatPage navigate={setRoute} /> : <ShellPlaceholder route={route} />}
      </AppShell>
    );
  }

  return <LoginPage navigate={setRoute} />;
}
