import { AuthLayout } from "../../components/layout/AuthLayout";
import { TextField } from "../../components/common/TextField";
import type { Navigate } from "../../types";

interface ForgotPasswordPageProps {
  navigate: Navigate;
}

export function ForgotPasswordPage({ navigate }: ForgotPasswordPageProps) {
  return (
    <AuthLayout caption="安全重置你的密码">
      <div className="w-[400px] rounded-[14px] border border-agent-border bg-white p-11 shadow-agent">
        <div className="mb-1.5 text-2xl font-bold text-agent-ink">找回密码</div>
        <div className="mb-8 text-sm text-agent-muted">输入注册邮箱，我们将发送验证码</div>
        <div className="flex flex-col gap-[18px]">
          <label className="flex flex-col gap-[7px]">
            <span className="agent-label">邮箱地址</span>
            <span className="flex gap-2">
              <input className="agent-input flex-1 px-4 py-[11px] text-sm" type="email" placeholder="name@example.com" />
              <button className="whitespace-nowrap rounded-lg bg-agent-pale px-4 py-2.5 text-[13px] font-medium text-agent-primary hover:bg-agent-paleHover" type="button">
                发送验证码
              </button>
            </span>
          </label>
          <TextField label="验证码" placeholder="6 位数字验证码" hint="验证码 10 分钟内有效，请注意查收邮件" />
          <TextField label="新密码" type="password" placeholder="至少 8 位" />
          <TextField label="确认新密码" type="password" placeholder="再次输入新密码" />
          <button className="mt-0.5 rounded-lg bg-agent-primary px-5 py-3 text-[15px] font-semibold text-white hover:bg-agent-primaryHover" type="button" onClick={() => navigate("login")}>
            重置密码
          </button>
        </div>
        <div className="mt-6 text-center">
          <button className="text-[13px] font-medium text-agent-primary hover:underline" type="button" onClick={() => navigate("login")}>
            ← 返回登录
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}

