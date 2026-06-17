import { AuthLayout } from "../../components/layout/AuthLayout";
import { TextField } from "../../components/common/TextField";
import type { Navigate } from "../../types";

interface RegisterPageProps {
  navigate: Navigate;
}

export function RegisterPage({ navigate }: RegisterPageProps) {
  return (
    <AuthLayout caption={<>我们会用邮箱帮你保存<br />需求草稿和开发记录</>}>
      <div className="w-[420px] rounded-[14px] border border-agent-border bg-white p-10 shadow-agent">
        <div className="mb-1.5 text-2xl font-bold text-agent-ink">创建账号</div>
        <div className="mb-7 text-sm text-agent-muted">几步即可开始构建你的 Agent</div>
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
          <TextField label="邮箱验证码" maxLength={6} placeholder="6 位数字验证码" className="text-base tracking-[10px]" hint={<span className="text-agent-cyan">验证码已发送，57 秒后可重新发送</span>} />
          <TextField label="用户名" placeholder="给自己取个名字" />
          <TextField label="设置密码" type="password" placeholder="至少 8 位，含字母和数字" />
          <div className="-mt-3">
            <div className="mt-1 flex gap-1">
              <div className="h-[3px] flex-1 rounded-sm bg-agent-success" />
              <div className="h-[3px] flex-1 rounded-sm bg-agent-success" />
              <div className="h-[3px] flex-1 rounded-sm bg-agent-border" />
              <div className="h-[3px] flex-1 rounded-sm bg-agent-border" />
            </div>
            <div className="mt-2 text-xs font-medium text-agent-success">密码强度：中等</div>
          </div>
          <TextField label="确认密码" type="password" placeholder="再次输入密码" />
          <button className="mt-0.5 rounded-lg bg-agent-primary px-5 py-3 text-[15px] font-semibold text-white hover:bg-agent-primaryHover" type="button" onClick={() => navigate("setup")}>
            注 册
          </button>
        </div>
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

