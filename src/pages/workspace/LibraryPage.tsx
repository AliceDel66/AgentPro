import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { listRequirements } from "../../services/agentSpecService";
import { nextActionForStatus } from "../../lib/workflow";
import type { AgentRequirement } from "../../services/types";
import type { AppRoute, Navigate } from "../../types";

interface LibraryPageProps {
  navigate: Navigate;
  setActiveRequirementId: (requirementId: string | null) => void;
}

const columns = "grid-cols-[2fr_92px_92px_72px_104px_64px_108px]";

function statusMeta(status: string): { label: string; tone: "blue" | "gray" | "cyan" | "purple" | "green"; route: AppRoute } {
  const meta: Record<string, { label: string; tone: "blue" | "gray" | "cyan" | "purple" | "green"; route: AppRoute }> = {
    interviewing: { label: "访谈中", tone: "gray", route: "chat" },
    ready_for_spec: { label: "可生成", tone: "cyan", route: "spec" },
    spec_draft: { label: "草案中", tone: "blue", route: "spec" },
    approved: { label: "已审批", tone: "green", route: "dispatch" },
    archived: { label: "已归档", tone: "green", route: "chat" }
  };
  return meta[status] ?? { label: status, tone: "gray", route: "chat" };
}

export function LibraryPage({ navigate, setActiveRequirementId }: LibraryPageProps) {
  const [requirements, setRequirements] = useState<AgentRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRequirements() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await listRequirements();
        if (!cancelled) setRequirements(result.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取需求库失败";
        if (!cancelled) setErrorMessage(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRequirements();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="m-0 text-[22px] font-bold text-agent-ink">需求库</h1>
          <div className="mt-1 text-[13px] text-agent-muted">管理所有 Agent 需求项目</div>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-[10px] bg-agent-primary px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-agent-primaryHover"
          type="button"
          onClick={() => {
            setActiveRequirementId(null);
            navigate("chat");
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          新建需求
        </button>
      </div>

      <div className="mb-[22px] flex flex-wrap gap-2">
        {["全部", "访谈中", "草案中", "已审批", "已归档"].map((filter, index) => (
          <button
            className={`rounded-[10px] px-[18px] py-[7px] text-[13px] font-medium ${
              index === 0 ? "bg-agent-primary text-white" : "border border-agent-border bg-white text-agent-muted hover:border-agent-primary hover:text-agent-primary"
            }`}
            key={filter}
            type="button"
          >
            {filter}
          </button>
        ))}
      </div>

      {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}

      <div className="overflow-hidden rounded-xl border border-agent-border bg-white">
        <div className={`grid ${columns} border-b border-agent-divider bg-[#F8FAFC] px-6 py-[13px]`}>
          {["需求名称", "状态", "最近更新", "成熟度", "开发方式", "评审分", "下一步"].map((column) => (
            <span className="text-xs font-semibold text-agent-muted" key={column}>
              {column}
            </span>
          ))}
        </div>
        {loading ? <LoadingState className="px-6 py-8" label="正在读取需求库..." /> : null}
        {!loading && !requirements.length ? <div className="px-6 py-8 text-sm text-agent-muted">暂无需求，点击“新建需求”开始。</div> : null}
        {requirements.map((row, index) => {
          const meta = statusMeta(row.status);
          const next = nextActionForStatus(row.status);
          const openRow = () => {
            setActiveRequirementId(row.id);
            navigate(row.route ?? meta.route);
          };
          return (
            <div
              className={`grid ${columns} items-center px-6 py-4 hover:bg-[#FAFCFE] ${index === requirements.length - 1 ? "" : "border-b border-agent-divider"}`}
              key={row.id}
            >
              <button className="truncate text-left text-[13px] font-medium text-agent-ink hover:text-agent-primary" type="button" onClick={openRow}>
                {row.title}
              </button>
              <span>
                <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
              </span>
              <span className="text-xs text-agent-muted">刚刚</span>
              <span className="text-[13px] font-semibold text-agent-primary">{row.maturity}%</span>
              <span className="text-xs text-agent-muted">{row.status === "approved" ? "待选择" : "-"}</span>
              <span className="text-[13px] font-medium text-agent-subtle">-</span>
              <span>
                <button
                  className="rounded-lg bg-agent-pale px-3 py-1.5 text-xs font-semibold text-agent-primary hover:bg-agent-paleHover"
                  type="button"
                  onClick={() => {
                    setActiveRequirementId(row.id);
                    navigate(next.route);
                  }}
                >
                  {next.label}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
