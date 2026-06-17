import { AuthLayout } from "../../components/layout/AuthLayout";
import { TextField } from "../../components/common/TextField";
import type { Navigate } from "../../types";

interface LoginPageProps {
  navigate: Navigate;
}

export function LoginPage({ navigate }: LoginPageProps) {
  return (
    <AuthLayout caption={<>把模糊业务想法整理成<br />可开发、可评审的 Agent 产品</>}>
      <div className="w-[400px] rounded-[14px] border border-agent-border bg-white p-11 shadow-agent">
        <div className="mb-1.5 text-2xl font-bold text-agent-ink">欢迎回来</div>
        <div className="mb-8 text-sm text-agent-muted">登录你的 AgentPro 账号</div>
        <div className="flex flex-col gap-5">
          <TextField label="邮箱地址" type="email" placeholder="name@example.com" />
          <TextField
            label="密码"
            type="password"
            placeholder="输入密码"
            action={
              <button className="text-xs text-agent-primary hover:underline" type="button" onClick={() => navigate("forgot")}>
                忘记密码？
              </button>
            }
          />
          <button
            className="mt-1 rounded-lg bg-agent-primary px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-agent-primaryHover"
            type="button"
            onClick={() => navigate("setup")}
          >
            登 录
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
