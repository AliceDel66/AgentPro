import { Plus } from "lucide-react";
import { requirementSidebarItems } from "../../lib/mockData";
import type { AppRoute, Navigate } from "../../types";

interface RequirementSidebarProps {
  navigate?: Navigate;
  activeRoute?: AppRoute;
}

export function RequirementSidebar({ navigate }: RequirementSidebarProps) {
  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-agent-divider bg-white">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <span className="text-[13px] font-semibold text-agent-ink">需求列表</span>
        <button className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-agent-pale text-agent-primary hover:bg-agent-paleHover" title="新建需求" type="button">
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>
      <div className="mb-2.5 flex flex-wrap gap-1 px-2.5">
        <button className="rounded-full bg-agent-primary px-2.5 py-1 text-[11px] font-medium text-white" type="button">
          全部
        </button>
        <button className="rounded-full px-2.5 py-1 text-[11px] text-agent-muted hover:bg-[#F0F4FA]" type="button">
          草稿
        </button>
        <button className="rounded-full px-2.5 py-1 text-[11px] text-agent-muted hover:bg-[#F0F4FA]" type="button">
          已确认
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {requirementSidebarItems.map((item) => (
          <button
            className={`mb-1 w-full rounded-lg px-3 py-[11px] text-left ${item.active ? "bg-agent-pale" : "hover:bg-agent-bg"}`}
            key={item.title}
            type="button"
            onClick={() => navigate?.("chat")}
          >
            <div className={`text-[13px] ${item.active ? "font-medium text-agent-primary" : "text-agent-secondary"}`}>{item.title}</div>
            <div className={`mt-[3px] text-[11px] ${item.active ? "text-agent-muted" : "text-agent-subtle"}`}>{item.meta}</div>
          </button>
        ))}
      </div>
    </aside>
  );
}
