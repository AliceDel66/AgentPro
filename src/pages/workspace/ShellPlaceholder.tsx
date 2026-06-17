import type { AppRoute } from "../../types";

interface ShellPlaceholderProps {
  route: AppRoute;
}

const labels: Partial<Record<AppRoute, string>> = {
  chat: "需求访谈页",
  followup: "反问确认页",
  spec: "AgentSpec 需求草案页",
  library: "需求库页",
  dispatch: "开发调度页",
  monitor: "并行开发监控页",
  review: "自动评审报告页",
  settings: "设置页"
};

export function ShellPlaceholder({ route }: ShellPlaceholderProps) {
  return (
    <div className="grid flex-1 place-items-center bg-agent-bg p-8">
      <div className="rounded-xl border border-dashed border-agent-border bg-white px-8 py-7 text-center shadow-agent-sm">
        <div className="text-lg font-bold text-agent-ink">{labels[route] ?? "工作台页面"}</div>
        <div className="mt-2 text-sm text-agent-muted">页面内容将在后续功能板块中按设计稿逐步替换。</div>
      </div>
    </div>
  );
}
