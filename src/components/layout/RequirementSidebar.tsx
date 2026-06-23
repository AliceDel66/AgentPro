import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { listRequirements, renameRequirement, trashRequirement } from "../../services/agentSpecService";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRequirements() {
      try {
        const result = await listRequirements();
        if (!cancelled) setRequirements(result.data);
      } catch {
        if (!cancelled) {
          setRequirements([]);
          setErrorMessage("读取需求列表失败");
        }
      }
    }

    void loadRequirements();
    return () => {
      cancelled = true;
    };
  }, [activeRequirementId]);

  const beginRename = (item: AgentRequirement) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
    setErrorMessage(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const submitRename = async () => {
    const title = editingTitle.trim();
    if (!editingId || !title || actionId) return;
    setActionId(editingId);
    setErrorMessage(null);
    try {
      const result = await renameRequirement(editingId, title);
      setRequirements((current) =>
        current.map((item) => (item.id === editingId ? { ...item, title: result.data.title } : item))
      );
      cancelRename();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setActionId(null);
    }
  };

  const handleTrash = async (item: AgentRequirement) => {
    if (actionId) return;
    if (!window.confirm(`确认将「${item.title}」移入垃圾篓吗？可在需求库中恢复。`)) return;
    setActionId(item.id);
    setErrorMessage(null);
    try {
      await trashRequirement(item.id);
      setRequirements((current) => current.filter((row) => row.id !== item.id));
      if (item.id === activeRequirementId) {
        setActiveRequirementId?.(null);
        navigate?.("chat");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "删除需求失败");
    } finally {
      setActionId(null);
    }
  };

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
        {errorMessage ? <div className="mb-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] font-medium text-agent-danger">{errorMessage}</div> : null}
        {requirements.length ? (
          requirements.map((item) => {
            const active = item.id === activeRequirementId;
            const editing = editingId === item.id;
            return (
              <div
                className={`group mb-1 rounded-lg px-3 py-[11px] ${active ? "bg-agent-pale" : "hover:bg-agent-bg"}`}
                key={item.id}
              >
                {editing ? (
                  <div className="mb-2 flex items-center gap-1.5">
                    <input
                      className="min-w-0 flex-1 rounded-md border border-agent-border bg-white px-2 py-1 text-[12px] text-agent-ink outline-none focus:border-agent-primary"
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submitRename();
                        if (event.key === "Escape") cancelRename();
                      }}
                      autoFocus
                    />
                    <button className="text-agent-success disabled:opacity-50" disabled={actionId === item.id} title="保存" type="button" onClick={() => void submitRename()}>
                      <Check size={14} />
                    </button>
                    <button className="text-agent-subtle hover:text-agent-danger" title="取消" type="button" onClick={cancelRename}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      className={`min-w-0 flex-1 truncate text-left text-[13px] ${active ? "font-medium text-agent-primary" : "text-agent-secondary"}`}
                      type="button"
                      onClick={() => {
                        setActiveRequirementId?.(item.id);
                        navigate?.("chat");
                      }}
                    >
                      {item.title}
                    </button>
                    <button
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-agent-subtle opacity-0 hover:bg-white hover:text-agent-primary group-hover:opacity-100"
                      title="重命名"
                      type="button"
                      onClick={() => beginRename(item)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-agent-subtle opacity-0 hover:bg-red-50 hover:text-agent-danger group-hover:opacity-100 disabled:opacity-40"
                      disabled={actionId === item.id}
                      title="移入垃圾篓"
                      type="button"
                      onClick={() => void handleTrash(item)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
                <div className={`mt-[3px] text-[11px] ${active ? "text-agent-muted" : "text-agent-subtle"}`}>
                  {statusLabel(item.status)} · {item.maturity}%
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-3 py-5 text-xs leading-6 text-agent-muted">暂无需求，点击右上角加号或直接发送想法创建。</div>
        )}
      </div>
    </aside>
  );
}
