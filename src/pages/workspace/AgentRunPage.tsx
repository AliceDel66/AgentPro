import { ArrowLeft, Bot, Sparkles } from "lucide-react";
import { deliveryModeLabel } from "./AgentsPage";
import type { DeliveredAgent } from "../../services/types";
import type { Navigate } from "../../types";

interface AgentRunPageProps {
  agent: DeliveredAgent | null;
  navigate: Navigate;
}

export function AgentRunPage({ agent, navigate }: AgentRunPageProps) {
  if (!agent) {
    return (
      <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8">
        <div className="rounded-xl border border-dashed border-agent-border bg-white px-6 py-12 text-center">
          <div className="text-base font-semibold text-agent-ink">未选择 Agent</div>
          <button className="mt-4 rounded-[10px] bg-agent-pale px-4 py-2.5 text-[13px] font-semibold text-agent-primary hover:bg-agent-paleHover" type="button" onClick={() => navigate("agents")}>
            返回我的 Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[820px]">
        <button className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-agent-muted hover:text-agent-primary" type="button" onClick={() => navigate("agents")}>
          <ArrowLeft size={15} />
          返回我的 Agent
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-[12px] bg-agent-ink text-agent-cyan">
            <Bot size={21} />
          </div>
          <div>
            <h1 className="m-0 text-[21px] font-bold text-agent-ink">{agent.title}</h1>
            <div className="mt-0.5 text-[13px] text-agent-muted">交付形态：{deliveryModeLabel(agent.deliveryMode)}</div>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-agent-border bg-white p-5">
          <div className="mb-1.5 text-xs font-medium text-agent-subtle">Agent 目标</div>
          <div className="text-[13px] leading-7 text-agent-secondary">{agent.objective || "暂无目标描述。"}</div>
        </div>

        <div className="rounded-xl border border-dashed border-agent-primary/40 bg-agent-pale/40 p-6 text-center">
          <Sparkles className="mx-auto mb-2 text-agent-primary" size={22} />
          <div className="text-[15px] font-semibold text-agent-ink">软件内运行能力即将上线</div>
          <div className="mx-auto mt-1.5 max-w-[520px] text-[13px] leading-6 text-agent-muted">
            进入使用后将直接调用你在设置页配置的 AI 模型服务执行该 Agent，并以流式返回结果（开发计划中的切片 C）。
            当前可在评审报告与 AgentSpec 中查看其能力与产物。
          </div>
        </div>

        <div className="mt-5 flex items-end gap-2.5 opacity-60">
          <textarea
            className="agent-input min-h-[44px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
            placeholder="向该 Agent 描述你的任务（运行能力开发中）..."
            rows={1}
            disabled
          />
          <button className="h-[44px] shrink-0 cursor-not-allowed rounded-[10px] bg-agent-primary px-5 text-[13px] font-semibold text-white opacity-70" type="button" disabled>
            运行
          </button>
        </div>
      </div>
    </div>
  );
}
