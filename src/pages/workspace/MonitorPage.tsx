import { useEffect, useState } from "react";
import { Check, Circle, Inbox } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { TERMINAL_JOB_STATUSES } from "../../lib/workflow";
import { getRunnerEvents, getRunnerJob } from "../../services/runnerService";
import type { RunnerEvent, RunnerJob } from "../../services/types";
import type { Navigate } from "../../types";

interface MonitorPageProps {
  activeJobId: string | null;
  activeSpecId: string | null;
  navigate: Navigate;
  setActiveJobStatus: (status: string | null) => void;
}

const runnerSteps = ["创建隔离工作区", "读取需求文档", "代码实现", "运行测试", "提交候选方案"];

export function MonitorPage({ activeJobId, activeSpecId, navigate, setActiveJobStatus }: MonitorPageProps) {
  const [job, setJob] = useState<RunnerJob | null>(null);
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof window.setInterval> | null = null;
    let firstLoad = true;

    if (!activeJobId) {
      setJob(null);
      setEvents([]);
      setActiveJobStatus(null);
      return undefined;
    }
    const jobId = activeJobId;

    async function loadJob() {
      if (firstLoad) setLoading(true);
      setErrorMessage(null);
      try {
        const [jobResult, eventResult] = await Promise.all([
          getRunnerJob(jobId),
          getRunnerEvents(jobId).catch(() => ({ ok: true, data: [] as RunnerEvent[] }))
        ]);
        if (!cancelled) {
          setJob(jobResult.data);
          setEvents(eventResult.data);
          setActiveJobStatus(jobResult.data.status);
          if (TERMINAL_JOB_STATUSES.has(jobResult.data.status) && interval) {
            window.clearInterval(interval);
            interval = null;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取开发任务失败";
        if (!cancelled) setErrorMessage(message);
      } finally {
        if (!cancelled && firstLoad) {
          setLoading(false);
          firstLoad = false;
        }
      }
    }

    void loadJob();
    interval = window.setInterval(() => void loadJob(), 2000);
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [activeJobId, setActiveJobStatus]);

  const progress = job?.progress ?? 0;
  const engines = job?.engines ?? [];
  const canViewReview = Boolean(job?.status && TERMINAL_JOB_STATUSES.has(job.status));

  if (!activeJobId) {
    return (
      <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
        <div className="mx-auto max-w-[860px]">
          <h1 className="m-0 mb-1.5 text-[22px] font-bold text-agent-ink">并行开发监控</h1>
          <div className="mb-7 text-sm text-agent-muted">当前没有正在执行的开发任务。</div>
          <div className="rounded-xl border border-dashed border-agent-border bg-white px-8 py-14 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-agent-pale text-agent-primary">
              <Inbox size={24} />
            </div>
            <div className="text-lg font-semibold text-agent-ink">暂无开发任务</div>
            <div className="mx-auto mt-2 max-w-[420px] text-sm leading-7 text-agent-muted">
              请先完成需求草案并从开发调度创建任务。任务创建后，这里会显示真实 Job ID、Runner 状态和执行事件。
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <AppButton type="button" variant="secondary" onClick={() => navigate(activeSpecId ? "dispatch" : "library")}>
                {activeSpecId ? "前往开发调度" : "返回需求库"}
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[1020px]">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">并行开发监控</h1>
            <div className="mt-1 text-[13px] text-agent-muted">Job ID：{activeJobId}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${canViewReview ? "bg-agent-success" : "animate-pulse bg-agent-cyan"}`} />
            <StatusChip tone={statusTone(job?.status)}>{statusLabel(job?.status ?? (loading ? "loading" : "queued"))}</StatusChip>
          </div>
        </div>

        {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
        {loading && !job ? <LoadingState className="mb-4 rounded-lg bg-white px-5 py-4" label="正在读取开发任务..." /> : null}

        <div className="mb-7 grid grid-cols-2 gap-5">
          {engines.map((engine) => (
            <RunnerCard
              accent={engine === "claude-code" ? "claude" : "codex"}
              badge={statusLabel(job?.status ?? "queued")}
              key={engine}
              progress={progress}
              title={engine === "claude-code" ? "Claude Code Runner" : "Codex Runner"}
            />
          ))}
        </div>

        <div className="rounded-xl border border-agent-border bg-white px-6 py-5">
          <div className="mb-3.5 text-sm font-semibold text-agent-ink">任务快照</div>
          <div className="rounded-[10px] bg-agent-ink px-5 py-4 font-mono text-xs leading-8 text-[#A0AEC0]">
            {events.length ? (
              events.slice(-12).map((event) => (
                <div key={event.id}>
                  <span className={event.level === "error" ? "text-agent-danger" : event.level === "warning" ? "text-agent-warning" : "text-agent-cyan"}>
                    [{event.phase || event.level}]
                  </span>{" "}
                  <span className="text-[#64748B]">{formatEventTime(event.createdAt)}</span> {event.message}
                </div>
              ))
            ) : (
              <>
                <div>
                  <span className="text-agent-cyan">[System]</span> status={job?.status ?? "-"} progress={progress} strategy={job?.strategy ?? "-"}
                </div>
                <div>
                  <span className="text-agent-success">[System]</span> engines={engines.join(", ") || "-"}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <AppButton type="button" variant="secondary" onClick={() => navigate("dispatch")}>
            返回调度
          </AppButton>
          <AppButton disabled={!canViewReview} type="button" onClick={() => navigate("review")}>
            查看评审报告
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    loading: "读取中",
    queued: "等待执行",
    running: "执行中",
    completed: "已完成",
    completed_with_warnings: "完成但有警告",
    failed: "失败",
    blocked: "已阻塞"
  };
  return labels[status] ?? status;
}

function statusTone(status?: string): "blue" | "gray" | "cyan" | "green" | "orange" | "red" {
  switch (status) {
    case "completed":
      return "green";
    case "completed_with_warnings":
      return "orange";
    case "failed":
    case "blocked":
      return "red";
    case "running":
      return "cyan";
    case "queued":
      return "blue";
    default:
      return "gray";
  }
}

function formatEventTime(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "";
  return time.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
