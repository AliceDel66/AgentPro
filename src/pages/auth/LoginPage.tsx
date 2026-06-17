import { useState } from "react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { TextField } from "../../components/common/TextField";
import { loginWithPassword, persistAuthSession } from "../../services/authService";
import { getModelConfig } from "../../services/modelService";
import type { Navigate } from "../../types";

interface LoginPageProps {
  navigate: Navigate;
}

export function LoginPage({ navigate }: LoginPageProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!identifier.trim() || !password) {
      setErrorMessage("请输入邮箱和密码");
      return;
    }

    setSubmitting(true);
    try {
      const result = await loginWithPassword(identifier.trim(), password);
      persistAuthSession(result.data);
      const configResult = await getModelConfig();
      const hasSavedModelConfig = Boolean(configResult.data.secretSaved && configResult.data.model);
      navigate(hasSavedModelConfig ? "chat" : "setup");
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败，请稍后重试";
      setErrorMessage(message === "Invalid credentials" ? "邮箱或密码不正确" : message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout caption={<>把模糊业务想法整理成<br />可开发、可评审的 Agent 产品</>}>
      <div className="w-[400px] rounded-[14px] border border-agent-border bg-white p-11 shadow-agent">
        <div className="mb-1.5 text-2xl font-bold text-agent-ink">欢迎回来</div>
        <div className="mb-8 text-sm text-agent-muted">登录你的 AgentPro 账号</div>
        <div className="flex flex-col gap-5">
          <TextField label="邮箱地址" type="email" placeholder="name@example.com" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
          <TextField
            label="密码"
            type="password"
            placeholder="输入密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            action={
              <button className="text-xs text-agent-primary hover:underline" type="button" onClick={() => navigate("forgot")}>
                忘记密码？
              </button>
            }
          />
          {errorMessage ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
          <button
            className="mt-1 rounded-lg bg-agent-primary px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-agent-primaryHover"
            type="button"
            disabled={submitting}
            onClick={() => void handleLogin()}
          >
            {submitting ? "登录中..." : "登 录"}
          </button>
        </div>
        <div className="mt-7 text-center text-[13px] text-agent-muted">
          还没有账号？{" "}
          <button className="font-medium text-agent-primary hover:underline" type="button" onClick={() => navigate("register")}>
            免费注册
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
