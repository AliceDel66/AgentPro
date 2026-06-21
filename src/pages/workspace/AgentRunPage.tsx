import { useRef, useState } from "react";
import { ArrowLeft, Bot, Send, Sparkles } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { deliveryModeLabel } from "./AgentsPage";
import { runAgentStream } from "../../services/agentsService";
import type { DeliveredAgent } from "../../services/types";
import type { Navigate } from "../../types";

interface AgentRunPageProps {
  agent: DeliveredAgent | null;
  navigate: Navigate;
}

export function AgentRunPage({ agent, navigate }: AgentRunPageProps) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const outputRef = useRef("");

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

  const run = async () => {
    const task = input.trim();
    if (!task || running) return;
    setRunning(true);
    setHasRun(true);
    setErrorMessage(null);
    setOutput("");
    outputRef.current = "";
    try {
      await runAgentStream(agent.requirementId, task, (token) => {
        outputRef.current += token;
        setOutput(outputRef.current);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "运行 Agent 失败，请稍后重试。");
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void run();
    }
  };

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
            <div className="mt-0.5 text-[13px] text-agent-muted">交付形态：{deliveryModeLabel(agent.deliveryMode)} · 使用你在设置页配置的模型服务</div>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-agent-border bg-white p-5">
          <div className="mb-1.5 text-xs font-medium text-agent-subtle">Agent 目标</div>
          <div className="text-[13px] leading-7 text-agent-secondary">{agent.objective || "暂无目标描述。"}</div>
        </div>

        <div className="min-h-[180px] rounded-xl border border-agent-border bg-white p-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-agent-subtle">
            <Sparkles size={14} className="text-agent-primary" />
            运行结果
          </div>
          {!hasRun ? (
            <div className="py-8 text-center text-[13px] text-agent-muted">输入任务并点击运行，Agent 会基于自身 AgentSpec 实时生成结果。</div>
          ) : null}
          {errorMessage ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
          {output ? <div className="whitespace-pre-wrap text-[13px] leading-7 text-agent-secondary">{output}</div> : null}
          {running && !output ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-agent-muted">
              <Spinner size={16} className="text-agent-primary" />
              Agent 正在思考...
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-end gap-2.5">
          <textarea
            className="agent-input min-h-[44px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
            placeholder="向该 Agent 描述你的任务（⌘/Ctrl + Enter 运行）..."
            rows={1}
            value={input}
            disabled={running}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="inline-flex h-[44px] shrink-0 items-center gap-2 rounded-[10px] bg-agent-primary px-5 text-[13px] font-semibold text-white hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={running || !input.trim()}
            onClick={run}
          >
            {running ? <Spinner size={15} className="text-white" /> : <Send size={15} />}
            运行
          </button>
        </div>
      </div>
    </div>
  );
}
