import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { StatusChip } from "../../components/common/StatusChip";
import { startRunnerJob } from "../../services/runnerService";
import type { RunnerRequest } from "../../services/types";
import type { Navigate } from "../../types";

interface DispatchPageProps {
  activeRequirementId: string | null;
  activeSpecId: string | null;
  navigate: Navigate;
  setActiveJobId: (jobId: string | null) => void;
}

const strategies: Array<[string, string, string, RunnerRequest["strategy"], boolean]> = [
  ["Codex 实现", "使用 OpenAI Codex 独立完成开发", "预计 15-25 分钟", "codex", false],
  ["Claude Code 实现", "使用 Claude Code 独立完成开发", "预计 12-20 分钟", "claude-code", false],
  ["并行候选实现", "两个引擎同时开发，对比选最优", "预计 20-30 分钟", "parallel", true]
];

const pipeline = ["创建隔离工作区", "读取需求文档", "代码实现", "运行测试", "提交候选"];

const ready = ["开发任务包已准备好", "Codex 引擎可用", "Claude Code 引擎可用"];

export function DispatchPage({ activeRequirementId, activeSpecId, navigate, setActiveJobId }: DispatchPageProps) {
  const [strategy, setStrategy] = useState<RunnerRequest["strategy"]>("parallel");
  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStart = async () => {
    if (starting) return;
    if (!activeSpecId && !activeRequirementId) {
      setErrorMessage("请先生成并确认 AgentSpec");
      return;
    }

    setStarting(true);
    setErrorMessage(null);
    try {
      const result = await startRunnerJob({
        strategy,
        specId: activeSpecId ?? undefined,
        requirementId: activeRequirementId ?? undefined
      });
      setActiveJobId(result.data.id);
      navigate("monitor");
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建开发任务失败";
      setErrorMessage(message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[860px]">
        <h1 className="m-0 mb-1.5 text-[22px] font-bold text-agent-ink">开发调度</h1>
        <div className="mb-7 text-sm text-agent-muted">选择开发策略，系统将自动创建后端开发任务记录</div>

        <div className="mb-7 flex items-center justify-between rounded-xl border border-agent-border bg-white px-6 py-5">
          <div>
            <div className="text-base font-semibold text-agent-ink">当前 AgentSpec</div>
            <div className="mt-[3px] text-xs text-agent-muted">Spec ID：{activeSpecId ?? "未生成"} · Requirement ID：{activeRequirementId ?? "未选择"}</div>
          </div>
          <StatusChip tone={activeSpecId ? "green" : "gray"}>{activeSpecId ? "需求已就绪" : "待生成"}</StatusChip>
        </div>

        <div className="mb-4 text-base font-semibold text-agent-ink">选择开发策略</div>
        <div className="mb-8 grid grid-cols-3 gap-4">
          {strategies.map(([title, desc, time, value, recommended]) => {
            const active = value === strategy;
            return (
              <button
                className={`relative min-h-[152px] rounded-xl bg-white p-6 text-left transition-colors hover:border-agent-primary ${active ? "border-2 border-agent-primary" : "border border-agent-border"}`}
                key={value}
                type="button"
                onClick={() => setStrategy(value)}
              >
                {recommended ? <span className="absolute right-3.5 top-[-1px] rounded-b-lg bg-agent-primary px-3 py-[3px] text-[11px] font-semibold text-white">推荐</span> : null}
                <div className="mb-1.5 text-[15px] font-semibold text-agent-ink">{title}</div>
                <div className="mb-3.5 text-[13px] leading-6 text-agent-muted">{desc}</div>
                <div className="text-xs text-agent-subtle">{time}</div>
              </button>
            );
          })}
        </div>

        <div className="mb-5 rounded-xl border border-agent-border bg-white p-6">
          <div className="mb-[18px] text-base font-semibold text-agent-ink">执行计划</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {pipeline.map((step, index) => (
              <div className="contents" key={step}>
                <div className="flex items-center gap-2">
                  <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-agent-pale text-xs font-bold text-agent-primary">{index + 1}</div>
                  <span className="text-[13px] text-agent-secondary">{step}</span>
                </div>
                {index < pipeline.length - 1 ? <div className="h-px w-7 bg-agent-border" /> : null}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-[10px] bg-[#F0F7FF] px-[18px] py-3.5 text-[13px] leading-7 text-agent-secondary">
            <span className="font-semibold text-agent-primary">隔离工作区说明：</span>
            每个引擎在独立环境中工作，互不影响。后端会保存任务状态，监控页再读取同一个 jobId。
          </div>
        </div>

        <div className="mb-7 rounded-xl border border-agent-border bg-white px-6 py-5">
          <div className="mb-3.5 text-sm font-semibold text-agent-ink">准备状态</div>
          <div className="flex flex-wrap gap-5">
            {ready.map((item) => (
              <div className="flex items-center gap-2 text-[13px] text-agent-secondary" key={item}>
                <CheckCircle2 size={16} className="text-agent-success" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}

        <div className="flex justify-end gap-3">
          <AppButton type="button" variant="secondary" onClick={() => navigate("library")}>
            返回需求库
          </AppButton>
          <AppButton disabled={starting} loading={starting} type="button" onClick={() => void handleStart()}>
            {starting ? "创建中..." : "开始并行开发"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
