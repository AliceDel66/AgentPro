import { Plus } from "lucide-react";
import { StatusChip } from "../../components/common/StatusChip";
import type { AppRoute, Navigate } from "../../types";

interface LibraryPageProps {
  navigate: Navigate;
}

const filters = ["全部 (5)", "草稿 (1)", "已审批 (1)", "开发中 (1)", "评审中 (1)", "已归档 (1)"];

const rows: Array<{
  title: string;
  status: string;
  tone: "blue" | "gray" | "cyan" | "purple" | "green";
  updated: string;
  maturity: string;
  maturityTone?: string;
  method: string;
  score: string;
  route?: AppRoute;
}> = [
  { title: "自动客服 Agent", status: "评审中", tone: "purple", updated: "2 小时前", maturity: "87%", method: "Codex + Claude", score: "82", route: "review" },
  { title: "数据报表生成器", status: "开发中", tone: "cyan", updated: "5 小时前", maturity: "64%", method: "Claude Code", score: "—", route: "monitor" },
  { title: "智能排班助手", status: "已审批", tone: "blue", updated: "1 天前", maturity: "92%", method: "待选择", score: "—", route: "dispatch" },
  { title: "库存预警 Agent", status: "草稿", tone: "gray", updated: "3 天前", maturity: "35%", method: "—", score: "—", route: "chat" },
  { title: "供应商沟通 Agent", status: "已归档", tone: "green", updated: "1 周前", maturity: "100%", maturityTone: "text-agent-success", method: "Codex", score: "91" }
];

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
        {filters.map((filter, index) => (
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
        {rows.map((row, index) => (
          <button
            className={`grid w-full ${columns} items-center px-6 py-4 text-left hover:bg-[#FAFCFE] ${index === rows.length - 1 ? "" : "border-b border-agent-divider"}`}
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
