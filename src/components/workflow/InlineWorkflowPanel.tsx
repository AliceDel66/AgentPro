import { useEffect, useState } from "react";
import { CheckCircle2, Circle, FileText, Play, RefreshCcw, ShieldCheck, Sparkles, Square, Terminal } from "lucide-react";
import { AppButton } from "../common/Button";
import { StatusChip } from "../common/StatusChip";
import { TERMINAL_JOB_STATUSES } from "../../lib/workflow";
import { approveAgentSpec, generateAgentSpec, getAgentSpec } from "../../services/agentSpecService";
import { cancelRunnerJobOnDesktop, executeRunnerJobOnDesktop } from "../../services/localRunnerService";
import { createReviewReport, getLatestReview, getReviewReport } from "../../services/reviewService";
import { getRunnerEvents, getRunnerJob, startRunnerJob } from "../../services/runnerService";
import { useWorkflowStore } from "../../stores/workflowStore";
import type { AgentSpecDraft, RequirementDetail, ReviewReport, RunnerEvent, RunnerJob, RunnerRequest } from "../../services/types";

interface InlineWorkflowPanelProps {
  detail: RequirementDetail | null;
}

const cachedInlineSpecs = new Map<string, AgentSpecDraft | null>();

const strategies: Array<{ value: RunnerRequest["strategy"]; label: string; desc: string }> = [
  { value: "codex", label: "Codex", desc: "单引擎实现" },
  { value: "claude-code", label: "Claude", desc: "Claude Code" },
  { value: "parallel", label: "并行", desc: "双引擎对比" }
];

export function InlineWorkflowPanel({ detail }: InlineWorkflowPanelProps) {
  const requirementId = detail?.id ?? null;
  const activeSpecId = useWorkflowStore((state) => state.activeSpecId);
  const activeJobId = useWorkflowStore((state) => state.activeJobId);
  const activeReviewId = useWorkflowStore((state) => state.activeReviewId);
  const setActiveSpecId = useWorkflowStore((state) => state.setActiveSpecId);
  const setActiveJobId = useWorkflowStore((state) => state.setActiveJobId);
  const setActiveJobStatus = useWorkflowStore((state) => state.setActiveJobStatus);
  const setActiveReviewId = useWorkflowStore((state) => state.setActiveReviewId);
  const [spec, setSpec] = useState<AgentSpecDraft | null>(null);
  const [job, setJob] = useState<RunnerJob | null>(null);
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [strategy, setStrategy] = useState<RunnerRequest["strategy"]>("parallel");
  const [action, setAction] = useState<"spec" | "approve" | "start" | "cancel" | "review" | null>(null);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busy = action !== null;
  const pendingQuestions = detail?.followupQuestions.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    if (!requirementId || pendingQuestions > 0) {
      setSpec(null);
      setJob(null);
      setEvents([]);
      setReview(null);
      return undefined;
    }
    const currentRequirementId = requirementId;
    const cached = cachedInlineSpecs.get(currentRequirementId);
    if (cached !== undefined) setSpec(cached);

    async function loadSpec() {
      setLoadingSpec(cached === undefined);
      setErrorMessage(null);
      try {
        const result = await getAgentSpec(currentRequirementId);
        cachedInlineSpecs.set(currentRequirementId, result.data);
        if (!cancelled) {
          setSpec(result.data);
          setActiveSpecId(result.data.id);
        }
      } catch {
        cachedInlineSpecs.set(currentRequirementId, null);
        if (!cancelled) setSpec(null);
      } finally {
        if (!cancelled) setLoadingSpec(false);
      }
    }

    void loadSpec();
    return () => {
      cancelled = true;
    };
    // Keep this tied to requirement changes only; spec mutations update local state directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestions, requirementId, setActiveSpecId]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof window.setInterval> | null = null;
    if (!activeJobId) {
      setJob(null);
      setEvents([]);
      return undefined;
    }
    const currentJobId = activeJobId;

    async function loadJob() {
      try {
        const [jobResult, eventResult] = await Promise.all([
          getRunnerJob(currentJobId),
          getRunnerEvents(currentJobId).catch(() => ({ ok: true, data: [] as RunnerEvent[] }))
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
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "读取开发任务失败");
      }
    }

    void loadJob();
    interval = window.setInterval(() => void loadJob(), 2500);
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [activeJobId, setActiveJobStatus]);

  useEffect(() => {
    let cancelled = false;
    async function loadReview() {
      if (!activeReviewId && (!activeJobId || !job || !TERMINAL_JOB_STATUSES.has(displayJobStatus(job.status, events)))) {
        setReview(null);
        return;
      }
      try {
        const result = activeReviewId
          ? await getReviewReport(activeReviewId)
          : await getLatestReview({
              jobId: activeJobId ?? undefined,
              specId: activeSpecId ?? undefined
            });
        if (!cancelled) {
          setReview(result.data);
          if (result.data?.id) setActiveReviewId(result.data.id);
        }
      } catch {
        if (!cancelled) setReview(null);
      }
    }

    void loadReview();
    return () => {
      cancelled = true;
    };
  }, [activeJobId, activeReviewId, activeSpecId, events, job, setActiveReviewId]);

  const progress = Math.max(clampProgress(job?.progress), latestEventProgress(events));
  const status = displayJobStatus(job?.status, events);
  const specApproved = spec?.status === "approved";
  const canStart = Boolean(specApproved && spec?.id && requirementId);
  const jobTerminal = Boolean(job && TERMINAL_JOB_STATUSES.has(status));
  const canCancel = Boolean(job && !TERMINAL_JOB_STATUSES.has(status));
  const canCreateReview = Boolean(activeJobId && jobTerminal);

  const handleGenerateSpec = async (regenerate: boolean) => {
    if (!requirementId || busy) return;
    if (regenerate && !window.confirm("重新生成会基于最新访谈生成 AgentSpec 新版本，确定继续？")) return;
    setAction("spec");
    setErrorMessage(null);
    try {
      const result = await generateAgentSpec(requirementId);
      cachedInlineSpecs.set(requirementId, result.data);
      setSpec(result.data);
      setActiveSpecId(result.data.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "生成 AgentSpec 失败");
    } finally {
      setAction(null);
    }
  };

  const handleApprove = async () => {
    if (!requirementId || busy) return;
    setAction("approve");
    setErrorMessage(null);
    try {
      const result = await approveAgentSpec(requirementId);
      const approvedSpec = result.data.spec ?? (spec ? { ...spec, status: "approved" } : null);
      if (approvedSpec) {
        cachedInlineSpecs.set(requirementId, approvedSpec);
        setSpec(approvedSpec);
        setActiveSpecId(approvedSpec.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "审批 AgentSpec 失败");
    } finally {
      setAction(null);
    }
  };

  const handleStart = async () => {
    if (!canStart || !spec?.id || busy) return;
    setAction("start");
    setErrorMessage(null);
    try {
      const result = await startRunnerJob({
        strategy,
        specId: spec.id,
        requirementId: requirementId ?? undefined
      });
      setJob(result.data);
      setActiveJobId(result.data.id);
      setActiveJobStatus(result.data.status ?? "queued");
      void executeRunnerJobOnDesktop(result.data.id, {
        createReviewOnComplete: true,
        onStatus: setActiveJobStatus
      })
        .then(async () => {
          const latest = await getLatestReview({ jobId: result.data.id, specId: spec.id });
          if (latest.data) {
            setReview(latest.data);
            setActiveReviewId(latest.data.id);
          }
        })
        .catch((error) => {
          console.error("[AgentPro] 访谈页 Runner 执行失败", error);
          setActiveJobStatus("blocked");
        });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "创建开发任务失败");
    } finally {
      setAction(null);
    }
  };

  const handleCancel = async () => {
    if (!activeJobId || !canCancel || busy) return;
    setAction("cancel");
    setErrorMessage(null);
    try {
      await cancelRunnerJobOnDesktop(activeJobId, job?.engines ?? []);
      setActiveJobStatus("blocked");
      const result = await getRunnerJob(activeJobId);
      setJob(result.data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "取消本机 Runner 失败");
    } finally {
      setAction(null);
    }
  };

  const handleCreateReview = async () => {
    if (!canCreateReview || busy) return;
    setAction("review");
    setErrorMessage(null);
    try {
      const result = await createReviewReport({
        jobId: activeJobId ?? undefined,
        specId: spec?.id ?? activeSpecId ?? undefined
      });
      setReview(result.data);
      setActiveReviewId(result.data.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "生成评审报告失败");
    } finally {
      setAction(null);
    }
  };

  const errorStep = errorMessage ? (
    <WorkflowStepMessage icon={<Sparkles size={17} />} title="这一步暂时失败">
      <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div>
    </WorkflowStepMessage>
  ) : null;

  if (pendingQuestions > 0) {
    return (
      <>
        {errorStep}
        <WorkflowStepMessage icon={<Sparkles size={17} />} title="先确认需求关键信息" description="你回答完上面的反问后，我再进入 AgentSpec、开发和评审 workflow。">
          <div className="rounded-lg bg-agent-bg px-3 py-2 text-xs leading-6 text-agent-muted">
            还有 {pendingQuestions} 个问题待确认。当前不会提前展示后续开发步骤，避免用户误以为可以跳过需求确认。
          </div>
        </WorkflowStepMessage>
      </>
    );
  }

  return (
    <>
      {errorStep}

      <WorkflowStepMessage icon={<FileText size={17} />} title="第 1 步：生成并确认 AgentSpec" description="我先把已确认的需求整理成可执行草案。你确认草案后，才会进入开发方式选择。">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs leading-6 text-agent-muted">
            {loadingSpec ? "正在读取草案..." : spec ? `v${spec.version} · ${spec.title}` : "尚未生成 AgentSpec"}
          </div>
          {spec ? <StatusChip tone={spec.status === "approved" ? "green" : "blue"}>{spec.status === "approved" ? "已审批" : "草案"}</StatusChip> : null}
        </div>
        {spec ? <div className="mb-3 line-clamp-3 text-xs leading-6 text-agent-secondary">{String(spec.body.objective ?? "草案已生成，可继续审批或重新生成。")}</div> : null}
        {specApproved ? (
          <div className="rounded-lg bg-agent-bg px-3 py-2 text-xs leading-6 text-agent-muted">AgentSpec 已确认，下面进入开发方式选择。</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <AppButton className="px-3 py-2" disabled={!requirementId || busy} loading={action === "spec"} type="button" variant={spec ? "ghost" : "secondary"} onClick={() => void handleGenerateSpec(Boolean(spec))}>
              <RefreshCcw size={14} />
              {spec ? "重新生成" : "生成草案"}
            </AppButton>
            {spec ? (
              <AppButton className="px-3 py-2" disabled={busy} loading={action === "approve"} type="button" onClick={() => void handleApprove()}>
                <CheckCircle2 size={14} />
                确认
              </AppButton>
            ) : null}
          </div>
        )}
      </WorkflowStepMessage>

      {specApproved ? <WorkflowStepMessage icon={<Terminal size={17} />} title="第 2 步：选择开发方式" description="AgentSpec 已确认。选择 Runner 后启动开发，启动后才会进入运行监控。">
        {job ? (
          <div className="rounded-lg bg-agent-bg px-3 py-2 text-xs leading-6 text-agent-muted">
            开发任务已启动，状态为 <span className="font-semibold text-agent-primary">{statusLabel(status)}</span>，下面进入运行监控。
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {strategies.map((item) => {
                const active = strategy === item.value;
                return (
                  <button
                    className={`rounded-lg border px-2 py-2 text-left transition-colors ${active ? "border-agent-primary bg-agent-pale" : "border-agent-border hover:border-agent-primary"}`}
                    key={item.value}
                    type="button"
                    onClick={() => setStrategy(item.value)}
                  >
                    <div className={`text-xs font-semibold ${active ? "text-agent-primary" : "text-agent-ink"}`}>{item.label}</div>
                    <div className="mt-0.5 text-[10px] text-agent-muted">{item.desc}</div>
                  </button>
                );
              })}
            </div>
            <div className="mb-3 text-xs text-agent-muted">Spec：已确认</div>
            <AppButton className="w-full py-2.5" disabled={!canStart || busy} loading={action === "start"} type="button" onClick={() => void handleStart()}>
              <Play size={14} />
              开始真实开发
            </AppButton>
          </>
        )}
      </WorkflowStepMessage> : null}

      {job ? <WorkflowStepMessage icon={<Circle size={17} />} title="第 3 步：查看运行进度" description="开发启动后，我会持续显示 Runner 状态和最近事件。任务完成后才会进入自动评审。">
        {job ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="truncate font-mono text-[11px] text-agent-muted" title={job.id}>
                {job.id}
              </span>
              <span className="text-xs font-semibold text-agent-primary">{progress}%</span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-agent-divider">
              <div className="h-full rounded-full bg-agent-primary" style={{ width: `${progress}%` }} />
            </div>
            <div className="mb-3 rounded-lg bg-agent-ink px-3 py-2 font-mono text-[11px] leading-6 text-[#A0AEC0]">
              {events.length ? events.slice(-3).map((event) => <div key={event.id}>[{event.phase || event.level}] {event.message}</div>) : <div>status={status} engines={(job.engines ?? []).join(", ") || "-"}</div>}
            </div>
            <div className="flex gap-2">
              <AppButton className="flex-1 px-3 py-2" disabled={!canCancel || busy} loading={action === "cancel"} type="button" variant="secondary" onClick={() => void handleCancel()}>
                <Square size={13} />
                取消
              </AppButton>
              {jobTerminal ? <StatusChip tone="green">可评审</StatusChip> : <StatusChip tone="cyan">运行中</StatusChip>}
            </div>
          </>
        ) : (
          <div className="text-xs leading-6 text-agent-muted">启动开发任务后，这一步会显示 Runner 状态、进度和最近事件。</div>
        )}
      </WorkflowStepMessage> : null}

      {jobTerminal ? <WorkflowStepMessage icon={<ShieldCheck size={17} />} title="第 4 步：生成自动评审" description="开发任务结束后，点击生成评审报告；生成后才会展示评审结论。">
        {review ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-agent-muted">推荐：{engineLabel(review.recommendedEngine)}</span>
              <span className="text-[24px] font-bold text-agent-primary">{review.score}</span>
            </div>
            <div className="line-clamp-4 text-xs leading-6 text-agent-secondary">{review.summary ?? "评审报告已生成。"}</div>
          </>
        ) : (
          <>
            <div className="mb-3 text-xs leading-6 text-agent-muted">开发完成后可直接在这里生成评审报告，不需要切到报告页。</div>
            <AppButton className="w-full py-2.5" disabled={!canCreateReview || busy} loading={action === "review"} type="button" variant="secondary" onClick={() => void handleCreateReview()}>
              生成评审报告
            </AppButton>
          </>
        )}
      </WorkflowStepMessage> : null}
    </>
  );
}

function WorkflowStepMessage({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 flex gap-3">
      <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-agent-ink text-agent-cyan">
        {icon}
      </div>
      <div className="max-w-[620px] flex-1 rounded-[4px_16px_16px_16px] border border-agent-border bg-white p-5 shadow-[0_1px_4px_rgba(11,18,32,0.04)]">
        <div className="mb-1 text-sm font-semibold text-agent-ink">{title}</div>
        {description ? <div className="mb-4 text-xs leading-6 text-agent-muted">{description}</div> : null}
        {children}
      </div>
    </div>
  );
}

function latestEventProgress(events: RunnerEvent[]) {
  return events.reduce((max, event) => {
    const progress = typeof event.progress === "number"
      ? event.progress
      : typeof event.payload?.progress === "number"
        ? event.payload.progress
        : null;
    return progress == null ? max : Math.max(max, clampProgress(progress));
  }, 0);
}

function latestEventStatus(events: RunnerEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const status = typeof event.status === "string"
      ? event.status
      : typeof event.payload?.status === "string"
        ? event.payload.status
        : null;
    if (status) return status;
  }
  return null;
}

function displayJobStatus(status: string | undefined, events: RunnerEvent[]) {
  if (status && TERMINAL_JOB_STATUSES.has(status)) return status;
  return latestEventStatus(events) ?? status ?? "queued";
}

function clampProgress(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "等待执行",
    running: "执行中",
    completed: "已完成",
    completed_with_warnings: "有警告",
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

function engineLabel(engine: string | null | undefined) {
  const labels: Record<string, string> = {
    codex: "Codex",
    "claude-code": "Claude Code",
    parallel: "并行候选"
  };
  return engine ? labels[engine] ?? engine : "-";
}
