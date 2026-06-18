import { useEffect, useState } from "react";
import { AppButton } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { acceptReviewRecommendation, createReviewReport, getReviewReport, mergeReviewStrengths, requestReviewRework } from "../../services/reviewService";
import type { ReviewReport } from "../../services/types";
import type { Navigate } from "../../types";

interface ReviewPageProps {
  activeJobId: string | null;
  activeReviewId: string | null;
  activeSpecId: string | null;
  navigate: Navigate;
  setActiveReviewId: (reviewId: string | null) => void;
}

export function ReviewPage({ activeJobId, activeReviewId, activeSpecId, navigate, setActiveReviewId }: ReviewPageProps) {
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"accept" | "rework" | null>(null);
  const [merging, setMerging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const acting = action !== null;

  useEffect(() => {
    let cancelled = false;
    async function loadReport() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = activeReviewId
          ? await getReviewReport(activeReviewId)
          : await createReviewReport({
              jobId: activeJobId ?? undefined,
              specId: activeSpecId ?? undefined
            });
        if (!cancelled) {
          setReport(result.data);
          setActiveReviewId(result.data.id);
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
      setReport({ ...report, status: "rework_requested" });
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
      setReport({
        ...report,
        status: "merge_planned",
        summary: "已记录合并优点计划，请在开发调度中创建返工任务执行。"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "合并优点失败";
      setErrorMessage(message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[1020px]">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">自动评审报告</h1>
            <div className="mt-1 text-[13px] text-agent-muted">
              {loading ? <LoadingState label="正在生成评审报告..." /> : report?.summary ?? "候选方案对比"}
            </div>
          </div>
          <div className="flex gap-2.5">
            <AppButton disabled={!report || acting} loading={action === "rework"} type="button" variant="secondary" onClick={() => void handleRework()}>
              {action === "rework" ? "提交中..." : "要求返工"}
            </AppButton>
            <AppButton disabled={!report || acting || merging} loading={merging} type="button" variant="secondary" onClick={() => void handleMerge()}>
              {merging ? "记录中..." : "合并优点"}
            </AppButton>
            <AppButton disabled={!report || acting} loading={action === "accept"} type="button" onClick={() => void handleAccept()}>
              {action === "accept" ? "采纳中..." : "采纳推荐方案"}
            </AppButton>
          </div>
        </div>

        {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}

        <div className="mb-7 grid grid-cols-2 gap-5">
          <SummaryCard code="Cx" desc="后端评审记录中的候选方案基线。" score={report ? Math.max(0, report.score - 8) : 0} title="Codex 方案" />
          <SummaryCard code="Cl" desc={report?.summary ?? "等待后端评审结果。"} recommended={report?.recommendedEngine === "claude-code"} score={report?.score ?? 0} title="推荐方案" />
        </div>

        <div className="mb-6 rounded-xl border border-agent-border bg-white p-7">
          <div className="mb-1.5 text-base font-semibold text-agent-ink">维度评分</div>
          <div className="grid gap-5">
            <Dimension name="整体评分" value={report?.score ?? 0} />
            <Dimension lowerBetter name="幻觉风险" value={report?.hallucinationRisk ?? 0} />
            <Dimension name="稳定性" value={report?.stabilityScore ?? 0} />
            <Dimension name="性能表现" value={report?.performanceScore ?? 0} />
          </div>
        </div>

        <div className="rounded-xl border border-agent-border bg-white p-6">
          <div className="mb-4 text-base font-semibold text-agent-ink">评审发现</div>
          <div className="grid gap-3">
            {report?.findings?.length ? (
              report.findings.map((finding) => (
                <div className="flex items-start gap-3 rounded-[10px] bg-[#F8FAFC] p-3.5" key={String(finding.id)}>
                  <span className="shrink-0 rounded-lg bg-agent-warning px-2.5 py-[3px] text-[11px] font-semibold text-white">{String(finding.severity ?? "提示")}</span>
                  <div className="text-[13px] leading-6 text-agent-secondary">
                    <span className="font-semibold text-agent-ink">{String(finding.title ?? "")}</span>
                    <br />
                    {String(finding.detail ?? "")}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-agent-muted">暂无评审发现。</div>
            )}
          </div>
        </div>
      </div>
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

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex h-2 gap-1">
      <div className={`rounded ${color}`} style={{ flex: value }} />
      <div className="rounded bg-agent-divider" style={{ flex: 100 - value }} />
    </div>
  );
}
