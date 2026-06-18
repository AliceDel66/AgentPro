import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { RequirementSidebar } from "../../components/layout/RequirementSidebar";
import { LoadingState } from "../../components/common/LoadingState";
import { Spinner } from "../../components/common/Spinner";
import { TypingIndicator } from "../../components/common/TypingIndicator";
import { TypewriterText } from "../../components/common/Typewriter";
import { FollowupQuestionCard } from "../../components/workflow/FollowupQuestionCard";
import { confirmRequirementFollowups, getRequirementDetail, streamRequirementDraft, streamRequirementMessage } from "../../services/agentSpecService";
import type { RequirementDetail } from "../../services/types";
import type { Navigate } from "../../types";

interface ChatPageProps {
  activeRequirementId: string | null;
  navigate: Navigate;
  setActiveRequirementId: (requirementId: string | null) => void;
}

function titleFromMessage(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized || "未命名需求";
}

function questionText(question: Record<string, unknown>) {
  return String(question.question ?? question.title ?? question.key ?? "待确认问题");
}

function questionKey(question: Record<string, unknown>, index: number) {
  return String(question.key ?? `question_${index + 1}`);
}

export function ChatPage({ activeRequirementId, navigate, setActiveRequirementId }: ChatPageProps) {
  const [draft, setDraft] = useState("");
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [animateMessageId, setAnimateMessageId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeRequirementId) {
      setDetail(null);
      setAnimateMessageId(null);
      return undefined;
    }
    const requirementId = activeRequirementId;
    // Already holding this requirement (e.g. just created it via send) — skip the refetch,
    // otherwise it clobbers the in-flight typewriter animation with a loading flash.
    if (detail?.id === requirementId) {
      return undefined;
    }
    // Switching to a different requirement: its history should render instantly, not animate.
    setAnimateMessageId(null);
    setAnswers({});

    async function loadRequirement() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await getRequirementDetail(requirementId);
        if (!cancelled) setDetail(result.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取需求失败";
        if (!cancelled) setErrorMessage(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRequirement();
    return () => {
      cancelled = true;
    };
  }, [activeRequirementId, detail?.id]);

  const pendingQuestions = detail?.followupQuestions ?? [];
  const maturity = detail?.maturity ?? 0;
  const confirmedCount = useMemo(() => detail?.decisions.filter((item) => item.confirmed).length ?? 0, [detail]);

  // Keep the conversation pinned to the latest message while loading / thinking.
  useEffect(() => {
    scrollToBottom();
  }, [detail?.messages.length, sending, scrollToBottom, streamingText]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setPendingMessage(content);
    setStreamingText("");
    setDraft("");
    setErrorMessage(null);
    try {
      const handleToken = (token: string) => {
        setStreamingText((current) => `${current}${token}`);
      };
      const result = activeRequirementId
        ? await streamRequirementMessage(activeRequirementId, content, handleToken)
        : await streamRequirementDraft({
            title: titleFromMessage(content),
            initialMessage: content
          }, handleToken);
      setDetail(result.data);
      setActiveRequirementId(result.data.id);
      setAnimateMessageId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送需求失败";
      setErrorMessage(message);
      setDraft(content);
    } finally {
      setSending(false);
      setPendingMessage(null);
      setStreamingText("");
    }
  };

  const answeredDecisions = pendingQuestions
    .map((question, index) => {
      const key = questionKey(question, index);
      return { key, value: answers[key]?.trim() ?? "" };
    })
    .filter((item) => item.value)
    .map((item) => ({ ...item, confirmed: true }));

  const handleConfirmFollowups = async () => {
    if (!activeRequirementId || confirming || !answeredDecisions.length) return;
    setConfirming(true);
    setErrorMessage(null);
    try {
      const result = await confirmRequirementFollowups(activeRequirementId, answeredDecisions);
      setDetail(result.data);
      const assistantMessages = result.data.messages.filter((message) => message.role === "assistant");
      setAnimateMessageId(assistantMessages[assistantMessages.length - 1]?.id ?? null);
      setAnswers({});
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交回答失败";
      setErrorMessage(message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <RequirementSidebar activeRequirementId={activeRequirementId} navigate={navigate} setActiveRequirementId={setActiveRequirementId} />

      <section className="flex min-w-0 flex-1 flex-col bg-agent-bg">
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-4 pt-7">
          {loading ? <LoadingState label="正在读取需求..." /> : null}
          {!detail && !loading ? (
            <div className="mx-auto mt-16 max-w-[560px] rounded-xl border border-agent-border bg-white p-7 text-center shadow-agent-sm">
              <div className="mb-2 text-lg font-bold text-agent-ink">从一个想法开始</div>
              <div className="text-sm leading-7 text-agent-muted">描述你想做的 Agent，系统会创建真实需求记录并生成需要确认的问题。</div>
            </div>
          ) : null}
          {detail?.messages.map((message) =>
            message.role === "user" ? (
              <div className="mb-6 flex justify-end" key={message.id}>
                <div className="max-w-[500px] rounded-[16px_16px_4px_16px] bg-agent-primary px-5 py-4 text-sm leading-7 text-white">{message.content}</div>
              </div>
            ) : (
              <div className="mb-5 flex gap-3" key={message.id}>
                <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-agent-ink text-agent-cyan">
                  <Bot size={17} />
                </div>
                <div className="max-w-[560px] whitespace-pre-line rounded-[4px_16px_16px_16px] border border-agent-border bg-white p-5 text-sm leading-8 text-agent-secondary shadow-[0_1px_4px_rgba(11,18,32,0.04)]">
                  <TypewriterText text={message.content} enabled={message.id === animateMessageId} onUpdate={scrollToBottom} />
                </div>
              </div>
            )
          )}
          {sending && pendingMessage ? (
            <div className="mb-6 flex justify-end">
              <div className="max-w-[500px] rounded-[16px_16px_4px_16px] bg-agent-primary px-5 py-4 text-sm leading-7 text-white">{pendingMessage}</div>
            </div>
          ) : null}
          {sending ? (
            <div className="mb-5 flex gap-3 animate-agent-fade-in">
              <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-agent-ink text-agent-cyan">
                <Bot size={17} />
              </div>
              <div className="max-w-[560px] whitespace-pre-line rounded-[4px_16px_16px_16px] border border-agent-border bg-white px-5 py-4 text-sm leading-8 text-agent-secondary shadow-[0_1px_4px_rgba(11,18,32,0.04)]">
                {streamingText ? (
                  <>
                    {streamingText}
                    <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-agent-caret bg-agent-primary align-middle" />
                  </>
                ) : (
                  <TypingIndicator label="正在思考" />
                )}
              </div>
            </div>
          ) : null}
          {detail && !sending && pendingQuestions.length ? (
            <div className="mb-5 ml-[46px] max-w-[560px] rounded-[12px] bg-[#F0F7FF] p-[18px]">
              <div className="mb-3 text-xs font-semibold tracking-[0.5px] text-agent-primary">
                还需要确认（可直接在此回答，或点“批量确认”）
              </div>
              <div className="grid gap-2.5">
                {pendingQuestions.map((question, index) => {
                  const key = questionKey(question, index);
                  return (
                    <FollowupQuestionCard
                      key={key}
                      index={index}
                      question={questionText(question)}
                      reason={question.reason ? String(question.reason) : undefined}
                      value={answers[key] ?? ""}
                      disabled={confirming}
                      onChange={(value) => setAnswers((current) => ({ ...current, [key]: value }))}
                      onMarkNA={() => setAnswers((current) => ({ ...current, [key]: "不适用" }))}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-agent-muted">已填写 {answeredDecisions.length}/{pendingQuestions.length}</span>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-agent-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={confirming || !answeredDecisions.length}
                  aria-busy={confirming}
                  onClick={() => void handleConfirmFollowups()}
                >
                  {confirming ? <Spinner size={14} className="text-white" /> : null}
                  {confirming ? "提交中..." : "提交回答"}
                </button>
              </div>
            </div>
          ) : null}
          {errorMessage ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-agent-divider bg-white px-7 py-4">
          <div className="flex items-end gap-2.5">
            <textarea
              className="agent-input min-h-[42px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
              placeholder="描述你的想法，或回答上面的问题..."
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              className="h-[42px] shrink-0 rounded-[10px] bg-agent-pale px-[18px] text-[13px] font-medium text-agent-primary hover:bg-agent-paleHover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!detail || !pendingQuestions.length}
              title="打开批量确认视图"
              type="button"
              onClick={() => navigate("followup")}
            >
              批量确认
            </button>
            <button
              className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-agent-primary text-white hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!draft.trim() || sending}
              title="发送"
              type="button"
              onClick={() => void handleSend()}
            >
              {sending ? <Spinner size={18} className="text-white" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </section>

      <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-agent-divider bg-white">
        <div className="border-b border-agent-divider px-5 py-[18px]">
          <div className="text-sm font-semibold text-agent-ink">需求成熟度</div>
          <div className="mt-0.5 text-xs text-agent-muted">当前需求的完整程度评估</div>
        </div>
        <div className="p-5">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[32px] font-bold text-agent-primary">{maturity}%</span>
            <span className="text-xs text-agent-muted">{pendingQuestions.length ? "需要更多信息" : "可以生成草案"}</span>
          </div>
          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-agent-divider">
            <div className="h-full rounded-full bg-gradient-to-r from-agent-primary to-agent-cyan" style={{ width: `${maturity}%` }} />
          </div>
          <div className="grid gap-3.5">
            <InfoBox tone="green" title={`已确认 (${confirmedCount})`}>
              {detail?.summary || "发送需求后会自动整理摘要。"}
            </InfoBox>
            <InfoBox tone="orange" title={`待确认 (${pendingQuestions.length})`}>
              {pendingQuestions.length ? pendingQuestions.map(questionText).join("；") : "暂无待确认问题。"}
            </InfoBox>
            <InfoBox tone="blue" title="系统建议">
              {pendingQuestions.length ? "建议先回答反问，再生成 AgentSpec 草案。" : "需求信息已较完整，可以生成需求草案。"}
            </InfoBox>
            <InfoBox tone="red" title="风险提醒">
              {String(detail?.safetyReview.risks ?? "高风险操作需要评估权限边界和人工审批。")}
            </InfoBox>
            <button
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-agent-primary px-4 py-3 text-[13px] font-semibold text-white hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!detail}
              type="button"
              onClick={() => navigate("spec")}
            >
              <Sparkles size={16} />
              生成需求草案
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function InfoBox({ tone, title, children }: { tone: "green" | "orange" | "blue" | "red"; title: string; children: React.ReactNode }) {
  const toneClasses = {
    green: "bg-[#ECFDF5] text-agent-success",
    orange: "bg-[#FFF7ED] text-agent-warning",
    blue: "bg-agent-pale text-agent-primary",
    red: "bg-[#FEF2F2] text-agent-danger"
  };

  return (
    <div className={`rounded-[10px] p-3.5 ${toneClasses[tone].split(" ")[0]}`}>
      <div className={`mb-2 text-xs font-semibold ${toneClasses[tone].split(" ")[1]}`}>{title}</div>
      <div className="line-clamp-6 text-xs leading-7 text-agent-secondary">{children}</div>
    </div>
  );
}
