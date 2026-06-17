import { useState } from "react";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import type { AppRoute } from "./types";

export default function App() {
  const [route, setRoute] = useState<AppRoute>("login");

  if (route === "register") return <RegisterPage navigate={setRoute} />;
  if (route === "forgot") return <ForgotPasswordPage navigate={setRoute} />;

  return <LoginPage navigate={setRoute} />;
}
