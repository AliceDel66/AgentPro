import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { deleteRequirement, listRequirements, restoreRequirement, trashRequirement } from "../../services/agentSpecService";
import { nextActionForStatus } from "../../lib/workflow";
import type { AgentRequirement } from "../../services/types";
import type { AppRoute, Navigate } from "../../types";

interface LibraryPageProps {
  navigate: Navigate;
  setActiveRequirementId: (requirementId: string | null) => void;
}

const columns = "grid-cols-[minmax(180px,2fr)_92px_92px_72px_104px_64px_138px]";

function statusMeta(status: string): { label: string; tone: "blue" | "gray" | "cyan" | "purple" | "green" | "red"; route: AppRoute } {
  const meta: Record<string, { label: string; tone: "blue" | "gray" | "cyan" | "purple" | "green" | "red"; route: AppRoute }> = {
    interviewing: { label: "访谈中", tone: "gray", route: "chat" },
    ready_for_spec: { label: "可生成", tone: "cyan", route: "spec" },
    spec_draft: { label: "草案中", tone: "blue", route: "spec" },
    approved: { label: "已审批", tone: "green", route: "dispatch" },
    archived: { label: "已归档", tone: "green", route: "chat" },
    trashed: { label: "垃圾篓", tone: "red", route: "library" }
  };
  return meta[status] ?? { label: status, tone: "gray", route: "chat" };
}

type FilterKey = "all" | "todo" | "interviewing" | "draft" | "approved" | "archived" | "trashed";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "todo", label: "需要我处理" },
  { key: "interviewing", label: "访谈中" },
  { key: "draft", label: "草案中" },
  { key: "approved", label: "已审批" },
  { key: "archived", label: "已归档" },
  { key: "trashed", label: "垃圾篓" }
];

// Statuses that still need the user to act (answer / generate / approve).
const TODO_STATUSES = ["interviewing", "ready_for_spec", "spec_draft"];

function matchesFilter(status: string, key: FilterKey): boolean {
  switch (key) {
    case "todo":
      return status !== "trashed" && TODO_STATUSES.includes(status);
    case "interviewing":
      return status === "interviewing";
    case "draft":
      return status === "ready_for_spec" || status === "spec_draft";
    case "approved":
      return status === "approved";
    case "archived":
      return status === "archived";
    case "trashed":
      return status === "trashed";
    default:
      return status !== "trashed";
  }
}

export function LibraryPage({ navigate, setActiveRequirementId }: LibraryPageProps) {
  const [requirements, setRequirements] = useState<AgentRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const filtered = useMemo(
    () => requirements.filter((row) => matchesFilter(row.status, filter)),
    [requirements, filter]
  );
  const activeRequirements = useMemo(
    () => requirements.filter((row) => row.status !== "trashed"),
    [requirements]
  );
  const counts = useMemo(
    () => ({
      total: activeRequirements.length,
      todo: activeRequirements.filter((row) => TODO_STATUSES.includes(row.status)).length,
      approved: activeRequirements.filter((row) => row.status === "approved").length,
      archived: activeRequirements.filter((row) => row.status === "archived").length,
      trashed: requirements.filter((row) => row.status === "trashed").length
    }),
    [activeRequirements, requirements]
  );

  function updateRequirementStatus(requirementId: string, status: string) {
    setRequirements((current) =>
      current.map((row) =>
        row.id === requirementId
          ? {
              ...row,
              status,
              route: status === "trashed" ? "library" : "chat"
            }
          : row
      )
    );
  }

  async function handleTrash(row: AgentRequirement) {
    if (!window.confirm(`确认将「${row.title}」移入垃圾篓吗？可在垃圾篓中恢复。`)) return;
    setActionId(row.id);
    setErrorMessage(null);
    try {
      const result = await trashRequirement(row.id);
      updateRequirementStatus(row.id, result.data.status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "移入垃圾篓失败");
    } finally {
      setActionId(null);
    }
  }

  async function handleRestore(row: AgentRequirement) {
    setActionId(row.id);
    setErrorMessage(null);
    try {
      const result = await restoreRequirement(row.id);
      updateRequirementStatus(row.id, result.data.status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "恢复需求失败");
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(row: AgentRequirement) {
    if (!window.confirm(`永久删除「${row.title}」后无法恢复，确认继续吗？`)) return;
    setActionId(row.id);
    setErrorMessage(null);
    try {
      await deleteRequirement(row.id);
      setRequirements((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "永久删除失败");
    } finally {
      setActionId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadRequirements() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await listRequirements({ includeTrash: true });
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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="全部需求" value={counts.total} tone="blue" active={filter === "all"} onClick={() => setFilter("all")} />
        <SummaryCard label="需要我处理" value={counts.todo} tone="orange" active={filter === "todo"} onClick={() => setFilter("todo")} />
        <SummaryCard label="已审批 / 可开发" value={counts.approved} tone="green" active={filter === "approved"} onClick={() => setFilter("approved")} />
        <SummaryCard label="已归档" value={counts.archived} tone="gray" active={filter === "archived"} onClick={() => setFilter("archived")} />
        <SummaryCard label="垃圾篓" value={counts.trashed} tone="red" active={filter === "trashed"} onClick={() => setFilter("trashed")} />
      </div>

      <div className="mb-[22px] flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              className={`rounded-[10px] px-[18px] py-[7px] text-[13px] font-medium ${
                active ? "bg-agent-primary text-white" : "border border-agent-border bg-white text-agent-muted hover:border-agent-primary hover:text-agent-primary"
              }`}
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}

      <div className="overflow-hidden rounded-xl border border-agent-border bg-white">
        <div className={`grid ${columns} border-b border-agent-divider bg-[#F8FAFC] px-6 py-[13px]`}>
          {["需求名称", "状态", "最近更新", "成熟度", "开发方式", "评审分", "下一步 / 操作"].map((column) => (
            <span className="text-xs font-semibold text-agent-muted" key={column}>
              {column}
            </span>
          ))}
        </div>
        {loading ? <LoadingState className="px-6 py-8" label="正在读取需求库..." /> : null}
        {!loading && !requirements.length ? <div className="px-6 py-8 text-sm text-agent-muted">暂无需求，点击“新建需求”开始。</div> : null}
        {!loading && requirements.length > 0 && !filtered.length ? (
          <div className="px-6 py-8 text-sm text-agent-muted">该筛选下暂无需求。</div>
        ) : null}
        {filtered.map((row, index) => {
          const meta = statusMeta(row.status);
          const next = nextActionForStatus(row.status);
          const isTrashed = row.status === "trashed";
          const busy = actionId === row.id;
          const openRow = () => {
            if (isTrashed) return;
            setActiveRequirementId(row.id);
            navigate(row.route ?? meta.route);
          };
          return (
            <div
              className={`grid ${columns} items-center px-6 py-4 hover:bg-[#FAFCFE] ${index === filtered.length - 1 ? "" : "border-b border-agent-divider"}`}
              key={row.id}
            >
              <button
                className={`truncate text-left text-[13px] font-medium ${
                  isTrashed ? "cursor-default text-agent-muted" : "text-agent-ink hover:text-agent-primary"
                }`}
                type="button"
                onClick={openRow}
              >
                {row.title}
              </button>
              <span>
                <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
              </span>
              <span className="text-xs text-agent-muted">刚刚</span>
              <span className="text-[13px] font-semibold text-agent-primary">{row.maturity}%</span>
              <span className="text-xs text-agent-muted">{row.status === "approved" ? "待选择" : "-"}</span>
              <span className="text-[13px] font-medium text-agent-subtle">-</span>
              <span className="flex items-center gap-1.5">
                {isTrashed ? (
                  <>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-agent-pale text-agent-primary hover:bg-agent-paleHover disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      title="恢复需求"
                      disabled={busy}
                      onClick={() => void handleRestore(row)}
                    >
                      <RotateCcw size={15} strokeWidth={2.4} />
                    </button>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-agent-danger hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      title="永久删除"
                      disabled={busy}
                      onClick={() => void handleDelete(row)}
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="rounded-lg bg-agent-pale px-2.5 py-1.5 text-xs font-semibold text-agent-primary hover:bg-agent-paleHover"
                      type="button"
                      onClick={() => {
                        setActiveRequirementId(row.id);
                        navigate(next.route);
                      }}
                    >
                      {next.label}
                    </button>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-agent-muted hover:bg-red-50 hover:text-agent-danger disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      title="移入垃圾篓"
                      disabled={busy}
                      onClick={() => void handleTrash(row)}
                    >
                      <Trash2 size={15} strokeWidth={2.3} />
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick
}: {
  label: string;
  value: number;
  tone: "blue" | "orange" | "green" | "gray" | "red";
  active: boolean;
  onClick: () => void;
}) {
  const toneText = {
    blue: "text-agent-primary",
    orange: "text-agent-warning",
    green: "text-agent-success",
    gray: "text-agent-subtle",
    red: "text-agent-danger"
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl bg-white px-5 py-4 text-left transition-colors hover:border-agent-primary ${
        active ? "border-2 border-agent-primary" : "border border-agent-border"
      }`}
    >
      <div className={`text-[26px] font-bold ${toneText}`}>{value}</div>
      <div className="mt-0.5 text-xs text-agent-muted">{label}</div>
    </button>
  );
}
