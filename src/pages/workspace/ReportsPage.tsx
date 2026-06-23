import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ClipboardList, Eye, RefreshCcw, WandSparkles } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { TERMINAL_JOB_STATUSES } from "../../lib/workflow";
import { executeRunnerJobOnDesktop } from "../../services/localRunnerService";
import { listReviewReports, optimizeFromReviewReport, regenerateReviewReport } from "../../services/reviewService";
import type { ReviewReport, RunnerJob } from "../../services/types";
import type { Navigate } from "../../types";

interface ReportsPageProps {
  navigate: Navigate;
  setActiveJobId: (jobId: string | null) => void;
  setActiveJobStatus: (status: string | null) => void;
  setActiveReviewId: (reviewId: string | null) => void;
  setActiveReviewTab: (tab: "overview" | "details" | "evidence" | "plan") => void;
}

type ReportAction = { type: "regenerate" | "optimize"; id: string } | null;
let cachedReports: ReviewReport[] | null = null;

export function ReportsPage({ navigate, setActiveJobId, setActiveJobStatus, setActiveReviewId, setActiveReviewTab }: ReportsPageProps) {
  const [reports, setReports] = useState<ReviewReport[]>(cachedReports ?? []);
  const [loading, setLoading] = useState(!cachedReports);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ReportAction>(null);

  const hasActiveOptimization = useMemo(
    () => reports.some((report) => report.optimizationJob && !TERMINAL_JOB_STATUSES.has(report.optimizationJob.status)),
    [reports]
  );

  const loadReports = useCallback(async (silent = false) => {
    if (!silent) setLoading(!cachedReports);
    setErrorMessage(null);
    try {
      const result = await listReviewReports();
      cachedReports = result.data;
      setReports(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取报告档案失败";
      setErrorMessage(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!hasActiveOptimization) return undefined;
    const timer = window.setInterval(() => void loadReports(true), 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveOptimization, loadReports]);

  const openReport = (report: ReviewReport, tab: "overview" | "details" | "evidence" | "plan" = "overview") => {
    setActiveJobId(report.jobId ?? null);
    setActiveJobStatus(report.jobId ? "completed" : null);
    setActiveReviewId(report.id);
    setActiveReviewTab(tab);
    navigate("review");
  };

  const handleRegenerate = async (report: ReviewReport) => {
    if (action) return;
    if (!isCompleteReport(report)) {
      await handleOptimize(report);
      return;
    }
    setAction({ type: "regenerate", id: report.id });
    setErrorMessage(null);
    try {
      const result = await regenerateReviewReport(report.id);
      setReports((current) => {
        const next = [result.data, ...current.filter((item) => item.id !== result.data.id)];
        cachedReports = next;
        return next;
      });
      setActiveReviewId(result.data.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重新生成评审失败";
      setErrorMessage(message);
    } finally {
      setAction(null);
    }
  };

  const handleOptimize = async (report: ReviewReport) => {
    if (action) return;
    setAction({ type: "optimize", id: report.id });
    setErrorMessage(null);
    try {
      const result = await optimizeFromReviewReport(report.id);
      setReports((current) => {
        const next = current.map((item) => (item.id === result.data.id ? result.data : item));
        cachedReports = next;
        return next;
      });
      if (result.data.optimizationJob) {
        setActiveJobId(result.data.optimizationJob.id);
        setActiveJobStatus(result.data.optimizationJob.status);
        void executeRunnerJobOnDesktop(result.data.optimizationJob.id, {
          createReviewOnComplete: true,
          onStatus: setActiveJobStatus
        })
          .then(() => void loadReports(true))
          .catch((error) => {
            console.error("[AgentPro] 报告优化本机 Runner 执行失败", error);
            setActiveJobStatus("blocked");
            void loadReports(true);
          });
      }
      void loadReports(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建优化任务失败";
      setErrorMessage(message);
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[1040px]">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">报告档案</h1>
            <div className="mt-1 text-[13px] text-agent-muted">集中查看历史评审报告，并基于报告发起重新评审或优化迭代。</div>
          </div>
          <AppButton disabled={loading} type="button" variant="secondary" onClick={() => void loadReports()}>
            <RefreshCcw size={16} />
            刷新
          </AppButton>
        </div>

        {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
        {loading && !reports.length ? <LoadingState className="rounded-xl border border-agent-border bg-white px-6 py-5" label="正在读取报告档案..." /> : null}

        {!loading && !reports.length ? (
          <div className="rounded-xl border border-dashed border-agent-border bg-white px-8 py-14 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-agent-pale text-agent-primary">
              <Archive size={24} />
            </div>
            <div className="text-lg font-semibold text-agent-ink">暂无评审报告</div>
            <div className="mx-auto mt-2 max-w-[420px] text-sm leading-7 text-agent-muted">
              完成真实开发并生成自动评审后，报告会沉淀在这里，后续可直接重新生成或发起优化。
            </div>
            <div className="mt-6 flex justify-center">
              <AppButton type="button" variant="secondary" onClick={() => navigate("library")}>
                返回需求库
              </AppButton>
            </div>
          </div>
        ) : null}

        {!loading && reports.length ? (
          <div className="grid gap-4">
            {reports.map((report) => (
              <ReportCard
                action={action}
                key={report.id}
                report={report}
                onOpen={() => openReport(report)}
                onOpenPlan={() => openReport(report, "plan")}
                onOptimize={() => void handleOptimize(report)}
                onRegenerate={() => void handleRegenerate(report)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  action,
  onOpen,
  onOpenPlan,
  onRegenerate,
  onOptimize
}: {
  report: ReviewReport;
  action: ReportAction;
  onOpen: () => void;
  onOpenPlan: () => void;
  onRegenerate: () => void;
  onOptimize: () => void;
}) {
  const optimizationRunning = Boolean(report.optimizationJob && !TERMINAL_JOB_STATUSES.has(report.optimizationJob.status));
  const regenerating = action?.type === "regenerate" && action.id === report.id;
  const optimizing = action?.type === "optimize" && action.id === report.id;
  const completeness = reportCompleteness(report);
  const complete = isCompleteReport(report);
  const hasActionPlan = Boolean(report.actionPlan?.length);

  return (
    <div className="rounded-xl border border-agent-border bg-white p-5">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="m-0 truncate text-base font-semibold text-agent-ink">{report.requirementTitle ?? "未命名需求"}</h2>
            <StatusChip tone={reviewTone(report.status)}>{reviewStatusLabel(report.status)}</StatusChip>
            {report.optimizationJob ? <StatusChip tone={jobTone(report.optimizationJob)}>{optimizationLabel(report.optimizationJob)}</StatusChip> : null}
          </div>
          <div className="grid gap-1 text-[12px] leading-6 text-agent-muted">
            <div>
              Report ID：{report.id} · Job ID：{report.jobId ?? "未关联"} · Spec ID：{report.specId ?? "未关联"}
            </div>
            <div>创建时间：{formatDate(report.createdAt)}</div>
          </div>
        </div>

        <div className="grid min-w-[108px] justify-items-end">
          <div className="text-[30px] font-bold text-agent-primary">
            {report.score}
            <span className="text-sm font-normal text-agent-muted">/100</span>
          </div>
          <div className="text-[12px] text-agent-muted">推荐：{engineLabel(report.recommendedEngine)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-[10px] bg-[#F8FAFC] px-4 py-3 text-[13px] leading-6 text-agent-secondary">
        {report.summary ?? "暂无摘要。"}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-[10px] bg-[#F8FAFC] px-4 py-3">
          <div className="text-[12px] font-semibold text-agent-ink">报告完整度</div>
          <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
            {completeness.map((item) => (
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${item.done ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-agent-muted"}`}
                key={item.label}
              >
                {item.done ? "已包含" : "缺少"}：{item.label}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[10px] bg-[#F8FAFC] px-4 py-3">
          <div className="text-[12px] font-semibold text-agent-ink">方案状态</div>
          <div className="mt-1.5 text-[13px] leading-6 text-agent-secondary">
            {hasActionPlan ? `已生成 ${report.actionPlan?.length ?? 0} 条可执行优化方案` : "旧版报告暂未包含优化方案，建议重新生成完整报告。"}
          </div>
        </div>
      </div>

      {report.optimizationJob ? (
        <div className="mt-3 rounded-[10px] bg-[#F0F7FF] px-4 py-3 text-[12px] leading-6 text-agent-secondary">
          最新优化任务：{report.optimizationJob.id} · {optimizationLabel(report.optimizationJob)} · 进度 {report.optimizationJob.progress}%
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <AppButton type="button" variant="ghost" onClick={onOpen}>
          <Eye size={16} />
          查看详情
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={onOpenPlan}>
          <ClipboardList size={16} />
          查看方案
        </AppButton>
        <AppButton disabled={Boolean(action)} loading={regenerating || (!complete && optimizing)} type="button" variant="secondary" onClick={onRegenerate}>
          <RefreshCcw size={16} />
          {regenerating || (!complete && optimizing) ? "生成中..." : complete ? "重新生成" : "补全报告"}
        </AppButton>
        <AppButton disabled={Boolean(action) || optimizationRunning} loading={optimizing} type="button" onClick={onOptimize}>
          <WandSparkles size={16} />
          {optimizationRunning ? "优化中" : optimizing ? "创建中..." : "优化"}
        </AppButton>
      </div>
    </div>
  );
}

function reportCompleteness(report: ReviewReport) {
  return [
    { label: "详细报告", done: Boolean(report.scoreBreakdown?.length) },
    { label: "证据链", done: Boolean(report.evidenceSources?.length) },
    { label: "优化方案", done: Boolean(report.actionPlan?.length) }
  ];
}

function isCompleteReport(report: ReviewReport) {
  return Boolean(report.scoreBreakdown?.length && report.evidenceSources?.length && report.actionPlan?.length);
}

function reviewStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    accepted: "已采纳",
    rework_requested: "需返工",
    merge_planned: "已规划合并"
  };
  return labels[status ?? "draft"] ?? status ?? "草稿";
}

function reviewTone(status?: string): "blue" | "gray" | "green" | "orange" {
  switch (status) {
    case "accepted":
      return "green";
    case "rework_requested":
    case "merge_planned":
      return "orange";
    case "draft":
      return "blue";
    default:
      return "gray";
  }
}

function jobTone(job: RunnerJob): "blue" | "cyan" | "green" | "orange" | "red" {
  switch (job.status) {
    case "completed":
      return "green";
    case "completed_with_warnings":
      return "orange";
    case "failed":
    case "blocked":
      return "red";
    case "running":
      return "cyan";
    default:
      return "blue";
  }
}

function optimizationLabel(job: RunnerJob) {
  const labels: Record<string, string> = {
    queued: "优化待执行",
    running: "优化中",
    completed: "优化完成",
    completed_with_warnings: "优化完成但有警告",
    failed: "优化失败",
    blocked: "优化阻塞"
  };
  return labels[job.status] ?? `优化：${job.status}`;
}

function engineLabel(engine: ReviewReport["recommendedEngine"]) {
  return engine === "claude-code" ? "Claude Code" : "Codex";
}

function formatDate(value?: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
