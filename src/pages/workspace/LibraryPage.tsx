import { Plus } from "lucide-react";
import { StatusChip } from "../../components/common/StatusChip";
import { libraryFilters, requirementLibraryRows } from "../../lib/mockData";
import type { Navigate } from "../../types";

interface LibraryPageProps {
  navigate: Navigate;
}

const columns = "grid-cols-[2.2fr_100px_100px_80px_120px_80px]";

export function LibraryPage({ navigate }: LibraryPageProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="m-0 text-[22px] font-bold text-agent-ink">需求库</h1>
          <div className="mt-1 text-[13px] text-agent-muted">管理所有 Agent 需求项目</div>
        </div>
        <button className="inline-flex items-center gap-2 rounded-[10px] bg-agent-primary px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-agent-primaryHover" type="button" onClick={() => navigate("chat")}>
          <Plus size={16} strokeWidth={2.5} />
          新建需求
        </button>
      </div>

      <div className="mb-[22px] flex flex-wrap gap-2">
        {libraryFilters.map((filter, index) => (
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

      <div className="overflow-hidden rounded-xl border border-agent-border bg-white">
        <div className={`grid ${columns} border-b border-agent-divider bg-[#F8FAFC] px-6 py-[13px]`}>
          {["需求名称", "状态", "最近更新", "成熟度", "开发方式", "评审分"].map((column) => (
            <span className="text-xs font-semibold text-agent-muted" key={column}>
              {column}
            </span>
          ))}
        </div>
        {requirementLibraryRows.map((row, index) => (
          <button
            className={`grid w-full ${columns} items-center px-6 py-4 text-left hover:bg-[#FAFCFE] ${index === requirementLibraryRows.length - 1 ? "" : "border-b border-agent-divider"}`}
            key={row.title}
            type="button"
            onClick={() => row.route && navigate(row.route)}
          >
            <span className="text-[13px] font-medium text-agent-ink">{row.title}</span>
            <span>
              <StatusChip tone={row.tone}>{row.status}</StatusChip>
            </span>
            <span className="text-xs text-agent-muted">{row.updated}</span>
            <span className={`text-[13px] font-semibold ${row.maturityTone ?? "text-agent-primary"}`}>{row.maturity}</span>
            <span className="text-xs text-agent-muted">{row.method}</span>
            <span className={`text-[13px] font-medium ${row.score === "—" ? "text-agent-subtle" : row.status === "已归档" ? "text-agent-success" : "text-agent-ink"}`}>{row.score}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
