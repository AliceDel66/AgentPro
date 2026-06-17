import type { ReactNode } from "react";
import { BarChart3, Bell, BotMessageSquare, FileText, FolderOpen, Monitor, Play, Settings } from "lucide-react";
import type { AppRoute, Navigate } from "../../types";

interface AppShellProps {
  route: AppRoute;
  navigate: Navigate;
  children: ReactNode;
}

const pageTitles: Partial<Record<AppRoute, string>> = {
  chat: "需求访谈",
  followup: "需求访谈 · 反问确认",
  spec: "AgentSpec 需求草案",
  library: "需求库",
  dispatch: "开发调度",
  monitor: "并行开发监控",
  review: "自动评审报告",
  settings: "设置"
};

const navItems = [
  { route: "chat" as const, label: "需求访谈", icon: BotMessageSquare, group: ["chat", "followup"] },
  { route: "spec" as const, label: "需求草案", icon: FileText, group: ["spec"] },
  { route: "library" as const, label: "需求库", icon: FolderOpen, group: ["library"] },
  { divider: true },
  { route: "dispatch" as const, label: "开发调度", icon: Play, group: ["dispatch"] },
  { route: "monitor" as const, label: "并行监控", icon: Monitor, group: ["monitor"] },
  { route: "review" as const, label: "自动评审", icon: BarChart3, group: ["review"] }
] as const;

function isActive(route: AppRoute, group?: readonly string[]) {
  return Boolean(group?.includes(route));
}

export function AppShell({ route, navigate, children }: AppShellProps) {
  const title = pageTitles[route] ?? "AgentPro";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-agent-bg text-agent-ink">
      <aside className="flex w-14 shrink-0 flex-col items-center border-r border-agent-divider bg-white py-3.5">
        <button
          aria-label="返回需求访谈"
          className="mb-6 grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-agent-primary text-[13px] font-extrabold text-white"
          type="button"
          onClick={() => navigate("chat")}
        >
          A
        </button>
        <nav className="flex flex-col items-center gap-1">
          {navItems.map((item, index) => {
            if ("divider" in item) {
              return <div className="my-1.5 h-px w-7 bg-agent-divider" key={`divider-${index}`} />;
            }
            const Icon = item.icon;
            const active = isActive(route, item.group);
            return (
              <button
                aria-label={item.label}
                className={`grid h-[38px] w-[38px] place-items-center rounded-[9px] transition-colors ${
                  active ? "bg-agent-pale text-agent-primary" : "text-agent-subtle hover:bg-[#F0F4FA] hover:text-agent-secondary"
                }`}
                key={item.route}
                title={item.label}
                type="button"
                onClick={() => navigate(item.route)}
              >
                <Icon size={20} strokeWidth={2} />
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <button
            aria-label="设置"
            className={`grid h-[38px] w-[38px] place-items-center rounded-[9px] transition-colors ${
              route === "settings" ? "bg-agent-pale text-agent-primary" : "text-agent-subtle hover:bg-[#F0F4FA] hover:text-agent-secondary"
            }`}
            title="设置"
            type="button"
            onClick={() => navigate("settings")}
          >
            <Settings size={20} />
          </button>
          <div className="mt-1 grid h-[30px] w-[30px] place-items-center rounded-full bg-agent-primary text-[11px] font-semibold text-white">张</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[50px] shrink-0 items-center justify-between border-b border-agent-divider bg-white px-7">
          <span className="text-[15px] font-semibold text-agent-ink">{title}</span>
          <div className="flex items-center gap-[18px]">
            <button className="relative text-agent-subtle hover:text-agent-primary" title="通知" type="button">
              <Bell size={18} />
              <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-agent-danger" />
            </button>
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-agent-primary text-[11px] font-semibold text-white">张</div>
              <span className="text-[13px] font-medium text-agent-secondary">张明</span>
            </div>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
