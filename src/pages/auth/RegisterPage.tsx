import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Spinner } from "../../components/common/Spinner";
import { TextField } from "../../components/common/TextField";
import { persistAuthSession, registerWithEmail, requestEmailCode } from "../../services/authService";
import type { Navigate } from "../../types";

interface RegisterPageProps {
  navigate: Navigate;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authErrorMessages: Record<string, string> = {
  "Code cooldown active": "验证码发送太频繁，请稍后再试",
  "Email already registered": "该邮箱已注册，请直接登录",
  "Invalid email code": "邮箱验证码不正确或已过期",
  "Request failed: 500": "服务暂时不可用，请稍后重试",
  "Failed to fetch": "无法连接后端服务，请确认 API 服务已启动"
};

function getFriendlyError(message: string) {
  return authErrorMessages[message] ?? message;
}

function getPasswordStrength(password: string) {
  if (!password) {
    return { label: "待输入", segments: 0, activeClass: "bg-agent-border", textClass: "text-agent-subtle" };
  }

  const score = [
    password.length >= 8,
    password.length >= 12,
    /[A-Za-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ].filter(Boolean).length;

  if (score <= 2) {
    return { label: "较弱", segments: 1, activeClass: "bg-agent-danger", textClass: "text-agent-danger" };
  }
  if (score <= 4) {
    return { label: "中等", segments: 2, activeClass: "bg-agent-warning", textClass: "text-agent-warning" };
  }
  return { label: "较强", segments: 4, activeClass: "bg-agent-success", textClass: "text-agent-success" };
}

export function RegisterPage({ navigate }: RegisterPageProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const trimmedEmail = email.trim();
  const trimmedName = name.trim();
  const isEmailValid = emailPattern.test(trimmedEmail);
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const handleSendCode = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setDebugCode(null);

    if (!isEmailValid) {
      setErrorMessage("请输入有效的邮箱地址");
      return;
    }
    if (cooldownSeconds > 0) return;

    setSendingCode(true);
    try {
      const result = await requestEmailCode(trimmedEmail);
      const nextCooldown = result.data.cooldownSeconds || 60;
      setCooldownSeconds(nextCooldown);

      if (result.data.debugCode) {
        setDebugCode(result.data.debugCode);
        setCode(result.data.debugCode);
        setStatusMessage("本地调试验证码已自动填入");
      } else {
        setStatusMessage("验证码已发送，请查收邮件");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "验证码发送失败";
      setErrorMessage(getFriendlyError(message));
    } finally {
      setSendingCode(false);
    }
  };

  const validateForm = () => {
    if (!isEmailValid) return "请输入有效的邮箱地址";
    if (!/^\d{6}$/.test(code)) return "请输入 6 位邮箱验证码";
    if (!trimmedName) return "请输入用户名";
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return "密码至少 8 位，并包含字母和数字";
    }
    if (password !== confirmPassword) return "两次输入的密码不一致";
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await registerWithEmail(trimmedEmail, code, password, trimmedName);
      persistAuthSession(result.data);
      navigate("setup");
    } catch (error) {
      const message = error instanceof Error ? error.message : "注册失败，请稍后重试";
      setErrorMessage(getFriendlyError(message));
    } finally {
      setSubmitting(false);
    }
  };

  const codeHint = debugCode
    ? `本地调试验证码：${debugCode}${cooldownSeconds > 0 ? `，${cooldownSeconds} 秒后可重新发送` : ""}`
    : cooldownSeconds > 0
      ? `验证码已发送，${cooldownSeconds} 秒后可重新发送`
      : "验证码 10 分钟内有效，请注意查收邮件";

  return (
    <AuthLayout caption={<>我们会用邮箱帮你保存<br />需求草稿和开发记录</>}>
      <div className="w-[420px] rounded-[14px] border border-agent-border bg-white p-10 shadow-agent">
        <div className="mb-1.5 text-2xl font-bold text-agent-ink">创建账号</div>
        <div className="mb-7 text-sm text-agent-muted">几步即可开始构建你的 Agent</div>
        <form className="flex flex-col gap-[18px]" onSubmit={handleSubmit} noValidate>
          <label className="flex flex-col gap-[7px]">
            <span className="agent-label">邮箱地址</span>
            <span className="flex gap-2">
              <input
                className="agent-input flex-1 px-4 py-[11px] text-sm"
                type="email"
                placeholder="name@example.com"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
              <button
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-agent-pale px-4 py-2.5 text-[13px] font-medium text-agent-primary transition-colors hover:bg-agent-paleHover disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={sendingCode || cooldownSeconds > 0}
                aria-busy={sendingCode}
                onClick={handleSendCode}
              >
                {sendingCode ? <Spinner size={14} className="text-agent-primary" /> : null}
                {sendingCode ? "发送中..." : cooldownSeconds > 0 ? `${cooldownSeconds}s` : "发送验证码"}
              </button>
            </span>
          </label>
          <TextField
            label="邮箱验证码"
            maxLength={6}
            placeholder="6 位数字验证码"
            className="text-base font-mono"
            inputMode="numeric"
            value={code}
            autoComplete="one-time-code"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            hint={<span className="text-agent-cyan">{codeHint}</span>}
          />
          <TextField
            label="用户名"
            placeholder="给自己取个名字"
            value={name}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="设置密码"
            type="password"
            placeholder="至少 8 位，含字母和数字"
            value={password}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="-mt-3">
            <div className="mt-1 flex gap-1">
              {[0, 1, 2, 3].map((segment) => (
                <div
                  className={`h-[3px] flex-1 rounded-sm ${segment < passwordStrength.segments ? passwordStrength.activeClass : "bg-agent-border"}`}
                  key={segment}
                />
              ))}
            </div>
            <div className={`mt-2 text-xs font-medium ${passwordStrength.textClass}`}>
              密码强度：{passwordStrength.label}
            </div>
          </div>
          <TextField
            label="确认密码"
            type="password"
            placeholder="再次输入密码"
            value={confirmPassword}
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {errorMessage ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
          {statusMessage ? <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-agent-cyan">{statusMessage}</div> : null}
          <button
            className="mt-0.5 inline-flex items-center justify-center gap-2 rounded-lg bg-agent-primary px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? <Spinner size={16} className="text-white" /> : null}
            {submitting ? "注册中..." : "注 册"}
          </button>
        </form>
        <div className="mt-[22px] text-center text-[13px] text-agent-muted">
          已有账号？{" "}
          <button className="font-medium text-agent-primary hover:underline" type="button" onClick={() => navigate("login")}>
            返回登录
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
