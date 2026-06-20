import { useEffect, useState } from "react";
import { Bot, Play } from "lucide-react";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { getDeliveredAgents } from "../../services/agentsService";
import type { DeliveredAgent } from "../../services/types";
import type { Navigate } from "../../types";

interface AgentsPageProps {
  navigate: Navigate;
  setActiveAgent: (agent: DeliveredAgent | null) => void;
}

export function deliveryModeLabel(mode: string) {
  switch (mode) {
    case "in_app":
      return "软件内使用";
    case "external":
      return "外部集成";
    case "standalone":
      return "独立后台";
    default:
      return "待确认形态";
  }
}

function deliveryTone(mode: string): "green" | "blue" | "purple" | "gray" {
  switch (mode) {
    case "in_app":
      return "green";
    case "external":
      return "blue";
    case "standalone":
      return "purple";
    default:
      return "gray";
  }
}

export function AgentsPage({ navigate, setActiveAgent }: AgentsPageProps) {
  const [agents, setAgents] = useState<DeliveredAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await getDeliveredAgents();
        if (!cancelled) setAgents(result.data);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "读取已交付 Agent 失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const openAgent = (agent: DeliveredAgent) => {
    setActiveAgent(agent);
    navigate("agentRun");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mb-7">
        <h1 className="m-0 text-[22px] font-bold text-agent-ink">我的 Agent</h1>
        <div className="mt-1 text-[13px] text-agent-muted">已采纳评审、开发完成的 Agent，可直接进入使用</div>
      </div>

      {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
      {loading ? <LoadingState className="px-1 py-6" label="正在读取已交付 Agent..." /> : null}

      {!loading && !agents.length ? (
        <div className="rounded-xl border border-dashed border-agent-border bg-white px-6 py-12 text-center">
          <div className="text-base font-semibold text-agent-ink">还没有已交付的 Agent</div>
          <div className="mt-1.5 text-[13px] text-agent-muted">完成开发并在评审报告中“采纳推荐方案”后，Agent 会出现在这里。</div>
        </div>
      ) : null}

      {!loading && agents.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => (
            <div className="rounded-xl border border-agent-border bg-white p-5" key={agent.requirementId}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-agent-ink text-agent-cyan">
                    <Bot size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-agent-ink" title={agent.title}>
                      {agent.title}
                    </div>
                    <StatusChip tone={deliveryTone(agent.deliveryMode)}>{deliveryModeLabel(agent.deliveryMode)}</StatusChip>
                  </div>
                </div>
              </div>
              <div className="mb-4 line-clamp-2 text-[13px] leading-6 text-agent-muted">{agent.objective || "暂无目标描述。"}</div>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-agent-primary px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-agent-primaryHover"
                type="button"
                onClick={() => openAgent(agent)}
              >
                <Play size={15} />
                进入使用
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
