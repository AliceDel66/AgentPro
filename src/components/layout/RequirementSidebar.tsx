import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { listRequirements } from "../../services/agentSpecService";
import type { AgentRequirement } from "../../services/types";
import type { AppRoute, Navigate } from "../../types";

interface RequirementSidebarProps {
  navigate?: Navigate;
  activeRequirementId?: string | null;
  activeRoute?: AppRoute;
  setActiveRequirementId?: (requirementId: string | null) => void;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    interviewing: "访谈中",
    ready_for_spec: "可生成草案",
    spec_draft: "草案中",
    approved: "已确认",
    archived: "已归档"
  };
  return labels[status] ?? status;
}

export function RequirementSidebar({ activeRequirementId, navigate, setActiveRequirementId }: RequirementSidebarProps) {
  const [requirements, setRequirements] = useState<AgentRequirement[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadRequirements() {
      try {
        const result = await listRequirements();
        if (!cancelled) setRequirements(result.data);
      } catch {
        if (!cancelled) setRequirements([]);
      }
    }

    void loadRequirements();
    return () => {
      cancelled = true;
    };
  }, [activeRequirementId]);

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-agent-divider bg-white">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <span className="text-[13px] font-semibold text-agent-ink">需求列表</span>
        <button
          className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-agent-pale text-agent-primary hover:bg-agent-paleHover"
          title="新建需求"
          type="button"
          onClick={() => {
            setActiveRequirementId?.(null);
            navigate?.("chat");
          }}
        >
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
        {requirements.length ? (
          requirements.map((item) => {
            const active = item.id === activeRequirementId;
            return (
              <button
                className={`mb-1 w-full rounded-lg px-3 py-[11px] text-left ${active ? "bg-agent-pale" : "hover:bg-agent-bg"}`}
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveRequirementId?.(item.id);
                  navigate?.(item.route ?? "chat");
                }}
              >
                <div className={`truncate text-[13px] ${active ? "font-medium text-agent-primary" : "text-agent-secondary"}`}>{item.title}</div>
                <div className={`mt-[3px] text-[11px] ${active ? "text-agent-muted" : "text-agent-subtle"}`}>
                  {statusLabel(item.status)} · {item.maturity}%
                </div>
              </button>
            );
          })
        ) : (
          <div className="px-3 py-5 text-xs leading-6 text-agent-muted">暂无需求，点击右上角加号或直接发送想法创建。</div>
        )}
      </div>
    </aside>
  );
}
