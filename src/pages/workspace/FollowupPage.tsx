import { useEffect, useState } from "react";
import { Bot, Check, CircleAlert } from "lucide-react";
import { RequirementSidebar } from "../../components/layout/RequirementSidebar";
import { LoadingState } from "../../components/common/LoadingState";
import { Spinner } from "../../components/common/Spinner";
import { confirmRequirementFollowups, getRequirementDetail, reconcileRequirementFollowupConfirmation } from "../../services/agentSpecService";
import type { RequirementDetail } from "../../services/types";
import type { Navigate } from "../../types";

interface FollowupPageProps {
  activeRequirementId: string | null;
  navigate: Navigate;
}

const cachedFollowupDetails = new Map<string, RequirementDetail>();

function questionText(question: Record<string, unknown>) {
  return String(question.question ?? question.title ?? question.key ?? "待回答问题");
}

function questionKey(question: Record<string, unknown>, index: number) {
  return String(question.key ?? `question_${index + 1}`);
}

export function FollowupPage({ activeRequirementId, navigate }: FollowupPageProps) {
  const [detail, setDetail] = useState<RequirementDetail | null>(activeRequirementId ? cachedFollowupDetails.get(activeRequirementId) ?? null : null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeRequirementId) {
      setDetail(null);
      setErrorMessage("请先创建或选择一个需求");
      return undefined;
    }
    const requirementId = activeRequirementId;
    const cached = cachedFollowupDetails.get(requirementId);
    if (cached) setDetail(cached);

    async function loadRequirement() {
      setLoading(!cached);
      setErrorMessage(null);
      try {
        const result = await getRequirementDetail(requirementId);
        cachedFollowupDetails.set(requirementId, result.data);
        if (!cancelled) {
          setDetail(result.data);
          const nextAnswers: Record<string, string> = {};
          result.data.followupQuestions.forEach((question, index) => {
            nextAnswers[questionKey(question, index)] = "";
          });
          setAnswers(nextAnswers);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取反问失败";
        if (!cancelled) setErrorMessage(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRequirement();
    return () => {
      cancelled = true;
    };
  }, [activeRequirementId]);

  const pendingQuestions = detail?.followupQuestions ?? [];
  const answeredCount = pendingQuestions.filter((question, index) => {
    const key = questionKey(question, index);
    return Boolean((answers[key] ?? "").trim());
  }).length;
  const allAnswered = pendingQuestions.length === 0 || answeredCount === pendingQuestions.length;

  const handleConfirm = async () => {
    if (!activeRequirementId || saving || !allAnswered) return;
    const decisions = pendingQuestions.map((question, index) => {
      const key = questionKey(question, index);
      return {
        key,
        value: answers[key]?.trim() ?? "",
        confirmed: true
      };
    });
    setSaving(true);
    setErrorMessage(null);
    try {
      await confirmRequirementFollowups(activeRequirementId, decisions);
      navigate("spec");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存确认项失败";
      const reconciled = await reconcileRequirementFollowupConfirmation(activeRequirementId, decisions);
      if (reconciled.detail) {
        cachedFollowupDetails.set(reconciled.detail.id, reconciled.detail);
        setDetail(reconciled.detail);
      }
      if (reconciled.accepted) {
        navigate("spec");
      } else {
        setErrorMessage(reconciled.detail ? `${message}；已刷新服务端状态，但确认尚未完成。` : `${message}；自动刷新服务端状态失败，请稍后重试。`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <RequirementSidebar activeRequirementId={activeRequirementId} navigate={navigate} />

      <section className="flex min-w-0 flex-1 flex-col bg-agent-bg">
        <div className="min-h-0 flex-1 overflow-y-auto p-7">
          <div className="mb-6 rounded-xl border border-agent-border bg-white px-5 py-4">
            <div className="mb-1.5 text-xs font-medium text-agent-subtle">对话摘要</div>
            <div className="text-[13px] leading-6 text-agent-secondary">
              {loading && !detail ? <LoadingState label="正在读取需求..." /> : detail?.summary || "暂无摘要"}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-agent-ink text-agent-cyan">
              <Bot size={17} />
            </div>
            <div className="min-w-0 max-w-[640px] flex-1">
              <div className="mb-4 rounded-[4px_16px_16px_16px] border border-agent-border bg-white px-[22px] py-[18px] text-sm leading-7 text-agent-secondary shadow-[0_1px_4px_rgba(11,18,32,0.04)]">
                基于我们的对话，我整理了一些需要你回答的问题。全部填写后统一提交，系统会继续生成后续 AgentSpec。
              </div>

              {pendingQuestions.length ? (
                pendingQuestions.map((question, index) => {
                  const key = questionKey(question, index);
                  return (
                    <div className="mb-3.5 rounded-xl border border-agent-border bg-white p-[22px]" key={key}>
                      <div className="mb-1 text-sm font-semibold text-agent-ink">问题 {index + 1}</div>
                      <div className="mb-3 text-[13px] leading-6 text-agent-secondary">{questionText(question)}</div>
                      <textarea
                        className="agent-input min-h-[74px] resize-none px-4 py-3 text-sm leading-6"
                        placeholder="填写这道问题的答案..."
                        value={answers[key] ?? ""}
                        onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}
                      />
                      {question.reason ? <div className="mt-2 text-xs text-agent-muted">{String(question.reason)}</div> : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-agent-border bg-white p-[22px]">
                  <div className="text-sm font-semibold text-agent-ink">当前没有待回答问题</div>
                  <div className="mt-1.5 text-[13px] leading-6 text-agent-muted">
                    需求关键信息已较完整。可以直接生成 AgentSpec 草案，或返回访谈补充更多细节。
                  </div>
                  <div className="mt-4 flex gap-2.5">
                    <button
                      className="rounded-[10px] bg-agent-primary px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-agent-primaryHover"
                      type="button"
                      onClick={() => navigate("spec")}
                    >
                      生成 AgentSpec
                    </button>
                    <button
                      className="rounded-[10px] bg-agent-pale px-4 py-2.5 text-[13px] font-semibold text-agent-primary hover:bg-agent-paleHover"
                      type="button"
                      onClick={() => navigate("chat")}
                    >
                      返回访谈
                    </button>
                  </div>
                </div>
              )}
              {errorMessage ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
            </div>
          </div>
        </div>

        <div className="border-t border-agent-divider bg-white px-7 py-4">
          <div className="flex justify-end gap-2.5">
            <button className="shrink-0 rounded-[10px] bg-agent-pale px-[22px] py-3 text-[13px] font-semibold text-agent-primary hover:bg-agent-paleHover" type="button" onClick={() => navigate("chat")}>
              返回访谈
            </button>
            <button
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-agent-primary px-[22px] py-3 text-[13px] font-semibold text-white hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!activeRequirementId || saving || !allAnswered}
              aria-busy={saving}
              type="button"
              onClick={() => void handleConfirm()}
            >
              {saving ? <Spinner size={15} className="text-white" /> : null}
              {saving ? "保存中..." : pendingQuestions.length ? `提交 ${pendingQuestions.length} 个回答` : "继续生成 AgentSpec"}
            </button>
          </div>
        </div>
      </section>

      <aside className="w-[280px] shrink-0 overflow-y-auto border-l border-agent-divider bg-white">
        <div className="border-b border-agent-divider px-5 py-[18px]">
          <div className="text-sm font-semibold text-agent-ink">已确认决策</div>
        </div>
        <div className="grid gap-3.5 p-5">
          <Panel tone="green" icon={<Check size={14} strokeWidth={2.5} />} title="当前需求">
            {detail?.title ?? "未选择需求"}
          </Panel>
          <Panel tone="orange" icon={<CircleAlert size={14} />} title="待回答">
            {pendingQuestions.length ? `${answeredCount}/${pendingQuestions.length} 已填写` : "暂无"}
          </Panel>
          <div className="rounded-[10px] bg-agent-pale p-3.5">
            <div className="mb-1.5 text-xs font-semibold text-agent-primary">系统评估</div>
            <div className="text-xs leading-6 text-agent-secondary">提交回答后会重新运行需求图谱，并用于生成 AgentSpec。</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Panel({ tone, icon, title, children }: { tone: "green" | "orange"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const styles = tone === "green" ? "bg-[#ECFDF5] text-agent-success" : "bg-[#FFF7ED] text-agent-warning";

  return (
    <div className={`rounded-[10px] p-3.5 ${styles.split(" ")[0]}`}>
      <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${styles.split(" ")[1]}`}>
        {icon}
        {title}
      </div>
      <div className="text-xs leading-6 text-agent-secondary">{children}</div>
    </div>
  );
}
