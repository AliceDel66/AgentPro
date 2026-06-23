import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, ExternalLink, FileText, Search, ShieldAlert } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { TERMINAL_JOB_STATUSES } from "../../lib/workflow";
import { openLocalPath } from "../../services/localPathService";
import { executeRunnerJobOnDesktop } from "../../services/localRunnerService";
import {
  acceptReviewRecommendation,
  createReviewReport,
  getLatestReview,
  getReviewReport,
  mergeReviewStrengths,
  optimizeFromReviewReport,
  requestReviewRework
} from "../../services/reviewService";
import type {
  ReviewActionPlanItem,
  ReviewEvidenceSource,
  ReviewReport,
  ReviewScoreBreakdown,
  RunnerDeliveryEntrypoint,
  RunnerDeliveryManifest
} from "../../services/types";
import type { Navigate } from "../../types";

type ReviewTab = "overview" | "details" | "evidence" | "plan";

interface ReviewPageProps {
  activeJobId: string | null;
  activeReviewId: string | null;
  activeReviewTab: ReviewTab;
  activeSpecId: string | null;
  navigate: Navigate;
  setActiveJobId: (jobId: string | null) => void;
  setActiveJobStatus: (status: string | null) => void;
  setActiveReviewId: (reviewId: string | null) => void;
  setActiveReviewTab: (tab: ReviewTab) => void;
}

function reviewCacheKey(activeReviewId: string | null, activeJobId: string | null, activeSpecId: string | null) {
  if (activeReviewId) return `review:${activeReviewId}`;
  if (activeJobId || activeSpecId) return `latest:${activeJobId ?? "-"}:${activeSpecId ?? "-"}`;
  return null;
}

const cachedReviewReports = new Map<string, ReviewReport | null>();

const tabs: Array<{ key: ReviewTab; label: string; icon: typeof FileText }> = [
  { key: "overview", label: "总览", icon: FileText },
  { key: "details", label: "详细报告", icon: Search },
  { key: "evidence", label: "证据链", icon: ShieldAlert },
  { key: "plan", label: "优化方案", icon: ClipboardList }
];

export function ReviewPage({
  activeJobId,
  activeReviewId,
  activeReviewTab,
  activeSpecId,
  navigate,
  setActiveJobId,
  setActiveJobStatus,
  setActiveReviewId,
  setActiveReviewTab
}: ReviewPageProps) {
  const initialReviewKey = reviewCacheKey(activeReviewId, activeJobId, activeSpecId);
  const [report, setReport] = useState<ReviewReport | null>(initialReviewKey ? cachedReviewReports.get(initialReviewKey) ?? null : null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"accept" | "rework" | "optimize" | null>(null);
  const [merging, setMerging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runnerMessage, setRunnerMessage] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const acting = action !== null;

  useEffect(() => {
    let cancelled = false;
    const cacheKey = reviewCacheKey(activeReviewId, activeJobId, activeSpecId);

    async function loadReport() {
      const cached = cacheKey ? cachedReviewReports.get(cacheKey) : undefined;
      if (cached !== undefined) setReport(cached);
      setLoading(cached === undefined);
      setErrorMessage(null);
      try {
        if (activeReviewId) {
          const result = await getReviewReport(activeReviewId);
          if (!cancelled) {
            if (cacheKey) cachedReviewReports.set(cacheKey, result.data);
            cachedReviewReports.set(`review:${result.data.id}`, result.data);
            setReport(result.data);
            setActiveReviewId(result.data.id);
          }
        } else {
          const result = await getLatestReview({
            jobId: activeJobId ?? undefined,
            specId: activeSpecId ?? undefined
          });
          if (!cancelled) {
            if (cacheKey) cachedReviewReports.set(cacheKey, result.data);
            if (result.data?.id) cachedReviewReports.set(`review:${result.data.id}`, result.data);
            setReport(result.data);
            if (result.data) setActiveReviewId(result.data.id);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取评审报告失败";
        if (!cancelled) setErrorMessage(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (activeReviewId || activeJobId || activeSpecId) {
      void loadReport();
    } else {
      setErrorMessage("请先创建开发任务或 AgentSpec");
    }

    return () => {
      cancelled = true;
    };
  }, [activeJobId, activeReviewId, activeSpecId, setActiveReviewId]);

  const deliveryManifest = useMemo(() => deliveryManifestFromReport(report), [report]);
  const legacyArtifactPath = useMemo(() => firstArtifactPath(report), [report]);
  const isLegacyReport = Boolean(report) && (!report?.scoreBreakdown?.length || !report?.actionPlan?.length);

  const refreshLatestReviewForJob = async (jobId: string, specId?: string | null) => {
    const latest = await getLatestReview({ jobId, specId: specId ?? undefined });
    if (latest.data) {
      setReport(latest.data);
      setActiveReviewId(latest.data.id);
      setActiveReviewTab("details");
      setRunnerMessage("本机 Runner 已完成，完整评审报告已刷新。");
    } else {
      setRunnerMessage("本机 Runner 已完成，但暂未读取到新评审报告，请稍后刷新报告档案。");
    }
  };

  const handleGenerate = async (isRegenerate: boolean) => {
    if (creating || acting) return;
    if (isRegenerate && !window.confirm("重新评审会基于当前开发产物生成一份新的评审报告，确定继续？")) {
      return;
    }
    setCreating(true);
    setErrorMessage(null);
    try {
      const result = await createReviewReport({
        jobId: activeJobId ?? undefined,
        specId: activeSpecId ?? undefined
      });
      setReport(result.data);
      cachedReviewReports.set(`review:${result.data.id}`, result.data);
      const cacheKey = reviewCacheKey(result.data.id, activeJobId, activeSpecId);
      if (cacheKey) cachedReviewReports.set(cacheKey, result.data);
      setActiveReviewId(result.data.id);
      setActiveReviewTab("overview");
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成评审报告失败";
      setErrorMessage(message);
    } finally {
      setCreating(false);
    }
  };

  const handleAccept = async () => {
    if (!report || acting) return;
    setAction("accept");
    setErrorMessage(null);
    try {
      await acceptReviewRecommendation(report.id);
      navigate("library");
    } catch (error) {
      const message = error instanceof Error ? error.message : "采纳推荐失败";
      setErrorMessage(message);
    } finally {
      setAction(null);
    }
  };

  const handleRework = async () => {
    if (!report || acting) return;
    setAction("rework");
    setErrorMessage(null);
    try {
      await requestReviewRework(report.id);
      const next = { ...report, status: "rework_requested" };
      cachedReviewReports.set(`review:${next.id}`, next);
      setReport(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "要求返工失败";
      setErrorMessage(message);
    } finally {
      setAction(null);
    }
  };

  const handleMerge = async () => {
    if (!report || acting || merging) return;
    setMerging(true);
    setErrorMessage(null);
    try {
      await mergeReviewStrengths(report.id);
      const next = {
        ...report,
        status: "merge_planned",
        summary: "已记录合并优点计划，请在开发调度中创建返工任务执行。"
      };
      cachedReviewReports.set(`review:${next.id}`, next);
      setReport(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "合并优点失败";
      setErrorMessage(message);
    } finally {
      setMerging(false);
    }
  };

  const handleOptimize = async () => {
    if (!report || acting) return;
    setAction("optimize");
    setErrorMessage(null);
    setRunnerMessage(null);
    try {
      const result = await optimizeFromReviewReport(report.id);
      setReport(result.data);
      cachedReviewReports.set(`review:${result.data.id}`, result.data);
      if (result.data.optimizationJob) {
        setActiveJobId(result.data.optimizationJob.id);
        setActiveJobStatus(result.data.optimizationJob.status);
        setRunnerMessage("已创建本机 Runner 优化任务，完成后会自动生成新的评审报告。");
        void executeRunnerJobOnDesktop(result.data.optimizationJob.id, {
          createReviewOnComplete: true,
          onStatus: setActiveJobStatus
        })
          .then(() => refreshLatestReviewForJob(result.data.optimizationJob!.id, result.data.specId))
          .catch((error) => {
            const message = error instanceof Error ? error.message : "本机 Runner 执行失败";
            console.error("[AgentPro] 详情页优化 Runner 执行失败", error);
            setActiveJobStatus("blocked");
            setErrorMessage(message);
          });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建优化任务失败";
      setErrorMessage(message);
    } finally {
      setAction(null);
    }
  };

  const handleCompleteReportWithDesktopRunner = async () => {
    if (!report || acting || creating) return;
    setCreating(true);
    setErrorMessage(null);
    setRunnerMessage(null);
    try {
      const result = await optimizeFromReviewReport(report.id);
      setReport(result.data);
      cachedReviewReports.set(`review:${result.data.id}`, result.data);
      if (!result.data.optimizationJob) {
        setErrorMessage("后端未返回可执行的本机 Runner 任务。");
        return;
      }
      const job = result.data.optimizationJob;
      setActiveJobId(job.id);
      setActiveJobStatus(job.status);
      setRunnerMessage("已创建本机 Runner 补全任务，正在调用客户本机 Codex/Claude Code 生成完整评审报告。");
      void executeRunnerJobOnDesktop(job.id, {
        createReviewOnComplete: true,
        onStatus: setActiveJobStatus
      })
        .then(() => refreshLatestReviewForJob(job.id, result.data.specId))
        .catch((error) => {
          const message = error instanceof Error ? error.message : "本机 Runner 补全报告失败";
          console.error("[AgentPro] 完整报告本机 Runner 执行失败", error);
          setActiveJobStatus("blocked");
          setErrorMessage(message);
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建完整报告任务失败";
      setErrorMessage(message);
    } finally {
      setCreating(false);
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue(null), 1400);
  };

  const openArtifactPath = async (path: string) => {
    try {
      await openLocalPath(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : "打开本机目录失败";
      setErrorMessage(message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-7 flex items-start justify-between gap-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[22px] font-bold text-agent-ink">自动评审报告</h1>
              {report ? <StatusChip tone={reviewTone(report.status)}>{reviewStatusLabel(report.status)}</StatusChip> : null}
            </div>
            <div className="text-[13px] leading-6 text-agent-muted">
              {loading && !report ? <LoadingState label="正在读取评审报告..." /> : report?.summary ?? "尚未生成评审报告"}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5">
            {report ? (
              <>
                <AppButton disabled={acting || creating} loading={creating} type="button" variant="ghost" onClick={() => void handleGenerate(true)}>
                  {creating ? "评审中..." : "重新评审"}
                </AppButton>
                <AppButton disabled={acting} loading={action === "rework"} type="button" variant="secondary" onClick={() => void handleRework()}>
                  {action === "rework" ? "提交中..." : "要求返工"}
                </AppButton>
                <AppButton disabled={acting || merging} loading={merging} type="button" variant="secondary" onClick={() => void handleMerge()}>
                  {merging ? "记录中..." : "合并优点"}
                </AppButton>
                <AppButton disabled={acting} loading={action === "accept"} type="button" onClick={() => void handleAccept()}>
                  {action === "accept" ? "采纳中..." : "采纳推荐方案"}
                </AppButton>
              </>
            ) : activeJobId || activeSpecId ? (
              <AppButton disabled={creating} loading={creating} type="button" onClick={() => void handleGenerate(false)}>
                {creating ? "生成中..." : "生成评审报告"}
              </AppButton>
            ) : null}
          </div>
        </div>

        {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
        {runnerMessage ? <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-agent-primary">{runnerMessage}</div> : null}

        {!report && !loading ? (
          <div className="rounded-xl border border-dashed border-agent-border bg-white px-6 py-12 text-center">
            <div className="text-base font-semibold text-agent-ink">尚未生成评审报告</div>
            <div className="mt-1.5 text-[13px] text-agent-muted">
              {activeJobId || activeSpecId
                ? "点击右上角“生成评审报告”，系统会基于开发产物、日志与 AgentSpec 自动评审。"
                : "请先创建开发任务或 AgentSpec。"}
            </div>
          </div>
        ) : null}

        {report ? (
          <>
            <ReportMeta report={report} />
            {isLegacyReport ? <LegacyNotice onRegenerate={() => void handleCompleteReportWithDesktopRunner()} creating={creating} /> : null}
            <ArtifactLocationCard
              copiedValue={copiedValue}
              fallbackPath={legacyArtifactPath}
              manifest={deliveryManifest}
              onCopy={(value) => void copyText(value)}
              onOpen={(path) => void openArtifactPath(path)}
              onViewDiff={() => setActiveReviewTab("evidence")}
            />

            <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-agent-border bg-white p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeReviewTab === tab.key;
                return (
                  <button
                    className={`inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                      active ? "bg-agent-primary text-white" : "text-agent-muted hover:bg-agent-pale hover:text-agent-primary"
                    }`}
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveReviewTab(tab.key)}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeReviewTab === "overview" ? (
              <OverviewTab report={report} onOptimize={() => void handleOptimize()} optimizing={action === "optimize"} />
            ) : null}
            {activeReviewTab === "details" ? <DetailsTab report={report} /> : null}
            {activeReviewTab === "evidence" ? <EvidenceTab report={report} /> : null}
            {activeReviewTab === "plan" ? (
              <PlanTab report={report} onOptimize={() => void handleOptimize()} optimizing={action === "optimize"} />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ReportMeta({ report }: { report: ReviewReport }) {
  return (
    <div className="mb-5 grid gap-3 rounded-xl border border-agent-border bg-white p-5 md:grid-cols-2">
      <MetaItem label="Report ID" value={report.id} />
      <MetaItem label="关联需求" value={report.requirementTitle ?? report.requirementId ?? "未关联"} />
      <MetaItem label="Job ID" value={report.jobId ?? "未关联"} />
      <MetaItem label="Spec ID" value={report.specId ?? "未关联"} />
      <MetaItem label="创建时间" value={formatDate(report.createdAt)} />
      <MetaItem label="推荐方案" value={engineLabel(report.recommendedEngine)} />
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-agent-subtle">{label}</div>
      <div className="mt-1 truncate text-[13px] font-medium text-agent-secondary" title={value}>
        {value}
      </div>
    </div>
  );
}

function LegacyNotice({ creating, onRegenerate }: { creating: boolean; onRegenerate: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
      <div className="flex items-start gap-3 text-[13px] leading-6 text-orange-700">
        <AlertTriangle className="mt-0.5 shrink-0" size={16} />
        该报告由旧版本生成，缺少完整详情字段。请调用本机 Codex/Claude Code 补全开发证据并生成完整报告。
      </div>
      <AppButton loading={creating} type="button" variant="secondary" onClick={onRegenerate}>
        {creating ? "创建中..." : "重新生成完整报告"}
      </AppButton>
    </div>
  );
}

function ArtifactLocationCard({
  manifest,
  fallbackPath,
  copiedValue,
  onCopy,
  onOpen,
  onViewDiff
}: {
  manifest: RunnerDeliveryManifest | null;
  fallbackPath: string | null;
  copiedValue: string | null;
  onCopy: (value: string) => void;
  onOpen: (path: string) => void;
  onViewDiff: () => void;
}) {
  const workspacePath = manifest?.workspacePath ?? fallbackPath;
  if (!workspacePath) return null;
  const buildEntry = manifest?.entrypoints.find((item) => item.kind === "build");
  const readmeEntry = manifest?.entrypoints.find((item) => item.kind === "readme");
  const changedCount = (manifest?.changedFiles.length ?? 0) + (manifest?.untrackedFiles.length ?? 0);

  return (
    <div className="mb-5 rounded-xl border border-agent-border bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-base font-semibold text-agent-ink">
          <ExternalLink size={17} />
          本机交付结果
        </div>
        <StatusChip tone={manifest ? "blue" : "orange"}>
          {manifest ? deliverableTypeLabel(manifest.deliverableType) : "旧任务"}
        </StatusChip>
      </div>
      {manifest ? (
        <>
          <div className="mb-3 text-[13px] leading-6 text-agent-secondary">{manifest.summary}</div>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <MiniMetric label="可打开入口" value={String(manifest.entrypoints.length)} />
            <MiniMetric label="新增/修改文件" value={String(changedCount)} />
            <MiniMetric label="构建产物" value={manifest.buildArtifactMissing ? "缺失" : "已发现"} />
          </div>
        </>
      ) : (
        <div className="mb-3 rounded-[10px] bg-orange-50 px-3 py-2 text-[13px] leading-6 text-orange-700">
          该任务由旧版本生成，只记录了 Runner 工作区，建议重新生成完整报告以获得交付清单。
        </div>
      )}
      <DeliveryPathRow label="Runner 工作区" path={workspacePath} />
      {manifest?.previewCommand ? (
        <DeliveryPathRow label="预览命令" path={manifest.previewCommand} />
      ) : null}
      {buildEntry ? <DeliveryPathRow label="构建产物" path={buildEntry.path} /> : null}
      {readmeEntry ? <DeliveryPathRow label="运行说明" path={readmeEntry.path} /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <AppButton type="button" onClick={() => onOpen(workspacePath)}>
          打开工作区
        </AppButton>
        {buildEntry ? (
          <AppButton type="button" variant="secondary" onClick={() => onOpen(buildEntry.path)}>
            打开构建产物
          </AppButton>
        ) : null}
        {readmeEntry ? (
          <AppButton type="button" variant="secondary" onClick={() => onOpen(readmeEntry.path)}>
            打开 README
          </AppButton>
        ) : null}
        <AppButton type="button" variant="secondary" onClick={() => onCopy(workspacePath)}>
          {copiedValue === workspacePath ? "已复制" : "复制工作区路径"}
        </AppButton>
        {manifest?.previewCommand ? (
          <AppButton type="button" variant="ghost" onClick={() => onCopy(manifest.previewCommand)}>
            {copiedValue === manifest.previewCommand ? "已复制" : "复制预览命令"}
          </AppButton>
        ) : null}
        <AppButton type="button" variant="ghost" onClick={onViewDiff}>
          查看 diff 证据
        </AppButton>
      </div>
    </div>
  );
}

function OverviewTab({ report, optimizing, onOptimize }: { report: ReviewReport; optimizing: boolean; onOptimize: () => void }) {
  const highPriorityPlans = report.actionPlan?.filter((item) => item.priority === "high").length ?? 0;
  const optimizationRunning = Boolean(report.optimizationJob && !TERMINAL_JOB_STATUSES.has(report.optimizationJob.status));

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <SummaryCard code="Cx" desc="后端评审记录中的候选方案基线。" score={Math.max(0, report.score - 8)} title="Codex 方案" />
        <SummaryCard code={report.recommendedEngine === "claude-code" ? "Cl" : "Cx"} desc={report.summary ?? "等待后端评审结果。"} recommended score={report.score} title="推荐方案" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-agent-border bg-white p-6">
          <div className="mb-4 text-base font-semibold text-agent-ink">维度评分</div>
          <div className="grid gap-5">
            <Dimension name="整体评分" value={report.score} />
            <Dimension lowerBetter name="幻觉风险" value={report.hallucinationRisk} />
            <Dimension name="稳定性" value={report.stabilityScore} />
            <Dimension name="性能表现" value={report.performanceScore} />
          </div>
        </div>
        <div className="rounded-xl border border-agent-border bg-white p-6">
          <div className="mb-3 text-base font-semibold text-agent-ink">结论与交付建议</div>
          <div className="rounded-[10px] bg-[#F8FAFC] px-4 py-3 text-[13px] leading-6 text-agent-secondary">
            {report.deliveryAdvice ?? "该报告缺少交付建议，建议重新生成完整报告。"}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <MiniMetric label="证据" value={String(report.evidenceSources?.length ?? 0)} />
            <MiniMetric label="方案" value={String(report.actionPlan?.length ?? 0)} />
            <MiniMetric label="高优先级" value={String(highPriorityPlans)} />
          </div>
          <AppButton className="mt-5 w-full" disabled={optimizationRunning} loading={optimizing} type="button" onClick={onOptimize}>
            {optimizationRunning ? "优化任务进行中" : optimizing ? "创建优化中..." : "按方案优化"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function DetailsTab({ report }: { report: ReviewReport }) {
  const items = report.scoreBreakdown ?? [];
  return (
    <div className="rounded-xl border border-agent-border bg-white p-6">
      <div className="mb-4 text-base font-semibold text-agent-ink">详细报告</div>
      {items.length ? (
        <div className="grid gap-4">
          {items.map((item) => (
            <ScoreBreakdownCard item={item} key={item.key} />
          ))}
        </div>
      ) : (
        <EmptyDetail text="该报告缺少详细评分结构，建议重新生成完整报告。" />
      )}
    </div>
  );
}

function EvidenceTab({ report }: { report: ReviewReport }) {
  const sources = report.evidenceSources ?? [];
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-agent-border bg-white p-6">
        <div className="mb-4 text-base font-semibold text-agent-ink">证据来源</div>
        {sources.length ? (
          <div className="grid gap-3">
            {sources.map((source) => (
              <EvidenceSourceCard source={source} key={source.id} />
            ))}
          </div>
        ) : (
          <EmptyDetail text="当前报告缺少 Runner events 或 artifacts，证据不足。" />
        )}
      </div>
      <div className="rounded-xl border border-agent-border bg-white p-6">
        <div className="mb-4 text-base font-semibold text-agent-ink">评审发现与 Evidence JSON</div>
        <div className="grid gap-3">
          {report.findings?.length ? (
            report.findings.map((finding) => <FindingCard finding={finding} key={String(finding.id)} />)
          ) : (
            <EmptyDetail text="暂无评审发现。" />
          )}
        </div>
      </div>
    </div>
  );
}

function PlanTab({ report, optimizing, onOptimize }: { report: ReviewReport; optimizing: boolean; onOptimize: () => void }) {
  const actionPlan = report.actionPlan ?? [];
  const optimizationRunning = Boolean(report.optimizationJob && !TERMINAL_JOB_STATUSES.has(report.optimizationJob.status));
  return (
    <div className="rounded-xl border border-agent-border bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-agent-ink">优化方案</div>
          <div className="mt-1 text-[13px] text-agent-muted">按优先级处理风险项，完成后重新生成评审报告。</div>
        </div>
        <AppButton disabled={!actionPlan.length || optimizationRunning} loading={optimizing} type="button" onClick={onOptimize}>
          {optimizationRunning ? "优化任务进行中" : optimizing ? "创建优化中..." : "按此方案优化"}
        </AppButton>
      </div>
      {actionPlan.length ? (
        <div className="grid gap-4">
          {actionPlan.map((item) => (
            <ActionPlanCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <EmptyDetail text="该报告缺少结构化优化方案，建议重新生成完整报告。" />
      )}
    </div>
  );
}

function SummaryCard({ code, title, score, desc, recommended = false }: { code: string; title: string; score: number; desc: string; recommended?: boolean }) {
  return (
    <div className={`relative rounded-xl bg-white p-6 ${recommended ? "border-2 border-agent-primary" : "border border-agent-border"}`}>
      {recommended ? <span className="absolute right-3.5 top-[-1px] rounded-b-lg bg-agent-primary px-3 py-[3px] text-[11px] font-semibold text-white">推荐采纳</span> : null}
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`grid h-[34px] w-[34px] place-items-center rounded-[9px] text-xs font-bold text-white ${code === "Cx" ? "bg-agent-ink" : "bg-[#D97757]"}`}>{code}</div>
          <span className="text-base font-semibold text-agent-ink">{title}</span>
        </div>
        <span className="text-[28px] font-bold text-agent-primary">
          {score}
          <span className="text-sm font-normal text-agent-muted">/100</span>
        </span>
      </div>
      <div className="text-[13px] leading-6 text-agent-muted">{desc}</div>
    </div>
  );
}

function Dimension({ name, value, lowerBetter = false }: { name: string; value: number; lowerBetter?: boolean }) {
  const color = lowerBetter ? "bg-agent-warning" : "bg-agent-primary";
  return (
    <div>
      <div className="mb-2 flex justify-between">
        <span className="text-[13px] font-medium text-agent-secondary">
          {name} {lowerBetter ? <span className="text-[11px] font-normal text-agent-subtle">(越低越好)</span> : null}
        </span>
        <span className="w-10 text-right text-xs font-semibold text-agent-ink">{value}</span>
      </div>
      <ScoreBar color={color} value={value} />
    </div>
  );
}

function ScoreBar({ value, color = "bg-agent-primary" }: { value: number; color?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#E8EEF8]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-[#F8FAFC] px-3 py-3">
      <div className="text-lg font-bold text-agent-primary">{value}</div>
      <div className="text-[11px] text-agent-muted">{label}</div>
    </div>
  );
}

function DeliveryPathRow({ label, path }: { label: string; path: string }) {
  return (
    <div className="mb-2 grid gap-1 rounded-[10px] bg-[#F8FAFC] px-3 py-2 last:mb-0 md:grid-cols-[96px_1fr] md:items-center">
      <div className="text-[12px] font-semibold text-agent-muted">{label}</div>
      <div className="truncate font-mono text-[12px] text-agent-secondary" title={path}>{path}</div>
    </div>
  );
}

function ScoreBreakdownCard({ item }: { item: ReviewScoreBreakdown }) {
  return (
    <div className="rounded-[10px] bg-[#F8FAFC] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-agent-ink">{item.label}</div>
          <div className="mt-1 text-[12px] text-agent-muted">证据数量：{item.evidenceCount}</div>
        </div>
        <div className="text-[24px] font-bold text-agent-primary">{item.score}</div>
      </div>
      <ScoreBar value={item.score} />
      <div className="mt-3 text-[13px] leading-6 text-agent-secondary">{item.reason}</div>
    </div>
  );
}

function EvidenceSourceCard({ source }: { source: ReviewEvidenceSource }) {
  return (
    <div className="rounded-[10px] bg-[#F8FAFC] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-agent-pale px-2.5 py-1 text-[11px] font-semibold text-agent-primary">{source.type}</span>
        {source.engine ? <span className="text-[12px] font-medium text-agent-muted">{engineLabel(source.engine)}</span> : null}
        <span className="text-[12px] text-agent-subtle">{formatDate(source.createdAt)}</span>
      </div>
      <div className="text-[13px] leading-6 text-agent-secondary">{source.summary}</div>
      {source.uri ? <div className="mt-2 truncate font-mono text-[11px] text-agent-muted">{source.uri}</div> : null}
    </div>
  );
}

function FindingCard({ finding }: { finding: Record<string, unknown> }) {
  return (
    <details className="rounded-[10px] bg-[#F8FAFC] p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 rounded-lg px-2.5 py-[3px] text-[11px] font-semibold text-white ${severityClass(String(finding.severity ?? "low"))}`}>
            {severityLabel(String(finding.severity ?? "low"))}
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-agent-ink">{String(finding.title ?? "")}</div>
            <div className="mt-1 text-[13px] leading-6 text-agent-secondary">{String(finding.detail ?? "")}</div>
          </div>
        </div>
      </summary>
      <div className="mt-4 rounded-[8px] bg-[#0F172A] p-3 font-mono text-[11px] leading-5 text-slate-200">
        <pre className="m-0 whitespace-pre-wrap break-words">{JSON.stringify(finding.evidence ?? {}, null, 2)}</pre>
      </div>
    </details>
  );
}

function ActionPlanCard({ item }: { item: ReviewActionPlanItem }) {
  return (
    <div className="rounded-[10px] bg-[#F8FAFC] p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityClass(item.priority)}`}>{priorityLabel(item.priority)}</span>
            {item.reworkRecommended ? <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-600">建议返工</span> : null}
          </div>
          <div className="mt-2 text-[15px] font-semibold text-agent-ink">{item.title}</div>
        </div>
        <CheckCircle2 className="shrink-0 text-agent-primary" size={18} />
      </div>
      <PlanLine label="原因" value={item.reason} />
      <PlanLine label="建议改法" value={item.recommendedChange} />
      <PlanLine label="验收方式" value={item.validationMethod} />
      <PlanLine label="关联 finding" value={item.sourceFindingIds.filter(Boolean).join(", ") || "未关联"} />
    </div>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 text-[13px] leading-6 text-agent-secondary">
      <span className="font-semibold text-agent-ink">{label}：</span>
      {value}
    </div>
  );
}

function EmptyDetail({ text }: { text: string }) {
  return <div className="rounded-[10px] border border-dashed border-agent-border bg-white px-4 py-8 text-center text-[13px] text-agent-muted">{text}</div>;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeEntrypoints(value: unknown): RunnerDeliveryEntrypoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const path = readString(record.path);
      if (!path) return null;
      return {
        label: readString(record.label, "入口"),
        kind: readString(record.kind, "file"),
        path
      };
    })
    .filter((item): item is RunnerDeliveryEntrypoint => Boolean(item));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function deliveryManifestFromReport(report: ReviewReport | null): RunnerDeliveryManifest | null {
  const source = report?.evidenceSources?.find((item) => item.type === "delivery-manifest" && item.payload);
  const payload = source?.payload;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const workspacePath = readString(record.workspacePath);
  if (!workspacePath) return null;
  return {
    version: Number(record.version ?? 1),
    jobId: readString(record.jobId, report?.jobId ?? ""),
    engine: readString(record.engine, source?.engine ?? "codex"),
    workspacePath,
    deliverableType: readString(record.deliverableType, "agentpro_patch"),
    summary: readString(record.summary, "本次产物已生成交付清单。"),
    entrypoints: normalizeEntrypoints(record.entrypoints),
    changedFiles: normalizeStringList(record.changedFiles),
    untrackedFiles: normalizeStringList(record.untrackedFiles),
    previewCommand: readString(record.previewCommand),
    buildArtifactMissing: Boolean(record.buildArtifactMissing),
    createdAt: readString(record.createdAt, source?.createdAt ?? "")
  };
}

function firstArtifactPath(report: ReviewReport | null) {
  if (!report?.evidenceSources?.length) return null;
  const source = report.evidenceSources.find((item) => item.type !== "delivery-manifest" && item.uri);
  return source?.uri ?? null;
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

function severityLabel(value: string) {
  const labels: Record<string, string> = { high: "高", medium: "中", low: "低" };
  return labels[value] ?? value;
}

function severityClass(value: string) {
  if (value === "high") return "bg-agent-danger";
  if (value === "medium") return "bg-agent-warning";
  return "bg-agent-success";
}

function priorityLabel(value: ReviewActionPlanItem["priority"]) {
  const labels = { high: "高优先级", medium: "中优先级", low: "低优先级" };
  return labels[value];
}

function priorityClass(value: ReviewActionPlanItem["priority"]) {
  if (value === "high") return "bg-red-50 text-red-600";
  if (value === "medium") return "bg-orange-50 text-orange-600";
  return "bg-emerald-50 text-emerald-600";
}

function engineLabel(engine?: string | null) {
  return engine === "claude-code" ? "Claude Code" : "Codex";
}

function deliverableTypeLabel(value: string) {
  const labels: Record<string, string> = {
    agentpro_patch: "AgentPro 源码补丁",
    in_app_agent: "内置 Agent",
    external_connector: "外部连接器",
    standalone_service: "独立服务"
  };
  return labels[value] ?? value;
}

function formatDate(value?: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
