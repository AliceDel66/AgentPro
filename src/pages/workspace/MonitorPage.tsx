import { Check, Circle } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { StatusChip } from "../../components/common/StatusChip";
import type { Navigate } from "../../types";

interface MonitorPageProps {
  navigate: Navigate;
}

const steps = ["创建隔离工作区", "读取需求文档", "代码实现", "运行测试", "提交候选方案"];

export function MonitorPage({ navigate }: MonitorPageProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[1020px]">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">并行开发监控</h1>
            <div className="mt-1 text-[13px] text-agent-muted">自动客服 Agent · 开始于 12 分钟前</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-agent-success" />
            <span className="text-[13px] font-medium text-agent-success">开发进行中</span>
          </div>
        </div>

        <div className="mb-7 grid grid-cols-2 gap-5">
          <RunnerCard
            accent="codex"
            badge="运行测试中"
            meta={["耗时 8m 23s", "Token 24.8k", "费用 $0.12"]}
            progress={72}
            statusTone="cyan"
            title="Codex Runner"
          />
          <RunnerCard
            accent="claude"
            badge="已提交候选"
            complete
            meta={["耗时 11m 47s", "Token 31.2k", "费用 $0.18"]}
            progress={100}
            statusTone="green"
            title="Claude Code Runner"
          />
        </div>

        <div className="rounded-xl border border-agent-border bg-white px-6 py-5">
          <div className="mb-3.5 text-sm font-semibold text-agent-ink">最近日志</div>
          <div className="rounded-[10px] bg-agent-ink px-5 py-4 font-mono text-xs leading-8 text-[#A0AEC0]">
            <div>
              <span className="text-agent-cyan">[Codex]</span> <span className="text-agent-muted">12:34:21</span> 运行测试 test_refund_flow...
            </div>
            <div>
              <span className="text-[#D97757]">[Claude]</span> <span className="text-agent-muted">12:34:28</span> 生成候选提交 candidate/claude-code
            </div>
            <div>
              <span className="text-agent-cyan">[Codex]</span> <span className="text-agent-muted">12:35:04</span> 检查订单系统工具调用边界
            </div>
            <div>
              <span className="text-agent-success">[System]</span> <span className="text-agent-muted">12:35:20</span> 等待 Codex 候选完成后进入自动评审
            </div>
          </div>
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <AppButton type="button" variant="secondary" onClick={() => navigate("dispatch")}>
            返回调度
          </AppButton>
          <AppButton type="button" onClick={() => navigate("review")}>
            查看评审报告
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function RunnerCard({
  title,
  accent,
  badge,
  statusTone,
  progress,
  complete = false,
  meta
}: {
  title: string;
  accent: "codex" | "claude";
  badge: string;
  statusTone: "cyan" | "green";
  progress: number;
  complete?: boolean;
  meta: string[];
}) {
  const brand = accent === "codex" ? { label: "Cx", bg: "bg-agent-ink", sub: "OpenAI Codex" } : { label: "Cl", bg: "bg-[#D97757]", sub: "Anthropic Claude" };

  return (
    <div className="overflow-hidden rounded-xl border border-agent-border bg-white">
      <div className="flex items-center justify-between border-b border-agent-divider px-[22px] py-[18px]">
        <div className="flex items-center gap-3">
          <div className={`grid h-[34px] w-[34px] place-items-center rounded-[9px] text-xs font-bold text-white ${brand.bg}`}>{brand.label}</div>
          <div>
            <div className="text-sm font-semibold text-agent-ink">{title}</div>
            <div className="text-[11px] text-agent-muted">{brand.sub}</div>
          </div>
        </div>
        <StatusChip tone={statusTone}>{badge}</StatusChip>
      </div>
      <div className="px-[22px] py-5">
        <div className="mb-2 flex justify-between">
          <span className="text-xs text-agent-muted">整体进度</span>
          <span className={`text-xs font-semibold ${complete ? "text-agent-success" : "text-agent-primary"}`}>{progress}%</span>
        </div>
        <div className="mb-[18px] h-[5px] overflow-hidden rounded-full bg-agent-divider">
          <div className={`h-full rounded-full ${complete ? "bg-agent-success" : "bg-agent-primary"}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="mb-[18px] grid gap-2.5">
          {steps.map((step, index) => {
            const done = complete || index < 3;
            const active = !complete && index === 3;
            return (
              <div className="flex items-center gap-2 text-xs" key={step}>
                {done ? (
                  <Check size={14} strokeWidth={2.5} className="text-agent-success" />
                ) : active ? (
                  <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-agent-cyan border-t-transparent" />
                ) : (
                  <Circle size={14} className="text-agent-border" />
                )}
                <span className={active ? "font-medium text-agent-cyan" : done ? "text-agent-secondary" : "text-agent-subtle"}>{step}</span>
                <span className={`ml-auto ${active ? "text-agent-cyan" : done ? "text-agent-subtle" : "text-agent-subtle"}`}>{active ? "进行中" : done ? "完成" : "等待"}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 rounded-lg bg-[#F8FAFC] px-4 py-3">
          {meta.map((item) => (
            <span className="text-[11px] text-agent-muted" key={item}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
