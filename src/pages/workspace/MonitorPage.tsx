import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { getRunnerJob } from "../../services/runnerService";
import type { RunnerJob } from "../../services/types";
import type { Navigate } from "../../types";

interface MonitorPageProps {
  activeJobId: string | null;
  navigate: Navigate;
}

const runnerSteps = ["创建隔离工作区", "读取需求文档", "代码实现", "运行测试", "提交候选方案"];

export function MonitorPage({ activeJobId, navigate }: MonitorPageProps) {
  const [job, setJob] = useState<RunnerJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeJobId) {
      setJob(null);
      return undefined;
    }
    const jobId = activeJobId;

    async function loadJob() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await getRunnerJob(jobId);
        if (!cancelled) setJob(result.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取开发任务失败";
        if (!cancelled) setErrorMessage(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadJob();
    return () => {
      cancelled = true;
    };
  }, [activeJobId]);

  const progress = job?.progress ?? 0;
  const engines = job?.engines ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[1020px]">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">并行开发监控</h1>
            <div className="mt-1 text-[13px] text-agent-muted">Job ID：{activeJobId ?? "未创建"}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-agent-success" />
            <span className="text-[13px] font-medium text-agent-success">{job?.status ?? (loading ? "读取中" : "待创建")}</span>
          </div>
        </div>

        {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
        {!activeJobId ? <div className="mb-4 rounded-lg bg-white px-5 py-4 text-sm text-agent-muted">请先从开发调度页创建任务。</div> : null}
        {activeJobId && loading && !job ? <LoadingState className="mb-4 rounded-lg bg-white px-5 py-4" label="正在读取开发任务..." /> : null}

        <div className="mb-7 grid grid-cols-2 gap-5">
          {(engines.length ? engines : ["codex", "claude-code"]).map((engine) => (
            <RunnerCard
              accent={engine === "claude-code" ? "claude" : "codex"}
              badge={job?.status ?? "等待任务"}
              key={engine}
              progress={progress}
              title={engine === "claude-code" ? "Claude Code Runner" : "Codex Runner"}
            />
          ))}
        </div>

        <div className="rounded-xl border border-agent-border bg-white px-6 py-5">
          <div className="mb-3.5 text-sm font-semibold text-agent-ink">任务快照</div>
          <div className="rounded-[10px] bg-agent-ink px-5 py-4 font-mono text-xs leading-8 text-[#A0AEC0]">
            <div>
              <span className="text-agent-cyan">[System]</span> status={job?.status ?? "-"} progress={progress} strategy={job?.strategy ?? "-"}
            </div>
            <div>
              <span className="text-agent-success">[System]</span> engines={engines.join(", ") || "-"}
            </div>
          </div>
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <AppButton type="button" variant="secondary" onClick={() => navigate("dispatch")}>
            返回调度
          </AppButton>
          <AppButton disabled={!activeJobId} type="button" onClick={() => navigate("review")}>
            查看评审报告
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function RunnerCard({ title, accent, badge, progress }: { title: string; accent: "codex" | "claude"; badge: string; progress: number }) {
  const brand = accent === "codex" ? { label: "Cx", bg: "bg-agent-ink", sub: "OpenAI Codex" } : { label: "Cl", bg: "bg-[#D97757]", sub: "Anthropic Claude" };

  return (
    <div className="overflow-hidden rounded-xl border border-agent-border bg-white">
      <div className="flex items-center justify-between border-b border-agent-divider px-[22px] py-[18px]">
        <div className="flex items-center gap-3">
          <div className={`grid h-[34px] w-[34px] place-items-center rounded-[9px] text-xs font-bold text-white ${brand.bg}`}>{brand.label}</div>
          <div>
            <div className="text-sm font-semibold text-agent-ink">{title}</div>
            <div className="text-[11px] text-agent-muted">{brand.sub}</div>
          </div>
        </div>
        <StatusChip tone={progress >= 100 ? "green" : "cyan"}>{badge}</StatusChip>
      </div>
      <div className="px-[22px] py-5">
        <div className="mb-2 flex justify-between">
          <span className="text-xs text-agent-muted">整体进度</span>
          <span className="text-xs font-semibold text-agent-primary">{progress}%</span>
        </div>
        <div className="mb-[18px] h-[5px] overflow-hidden rounded-full bg-agent-divider">
          <div className="h-full rounded-full bg-agent-primary" style={{ width: `${progress}%` }} />
        </div>
        <div className="mb-[18px] grid gap-2.5">
          {runnerSteps.map((step, index) => {
            const done = progress >= (index + 1) * 20;
            const active = !done && progress >= index * 20;
            return (
              <div className="flex items-center gap-2 text-xs" key={step}>
                {done ? (
                  <Check size={14} strokeWidth={2.5} className="text-agent-success" />
                ) : active ? (
                  <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-agent-cyan border-t-transparent" />
                ) : (
                  <Circle size={14} className="text-agent-border" />
                )}
                <span className={active ? "font-medium text-agent-cyan" : done ? "text-agent-secondary" : "text-agent-subtle"}>{step}</span>
                <span className={`ml-auto ${active ? "text-agent-cyan" : done ? "text-agent-subtle" : "text-agent-subtle"}`}>{active ? "进行中" : done ? "完成" : "等待"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
