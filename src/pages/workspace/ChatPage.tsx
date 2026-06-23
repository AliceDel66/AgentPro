import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Send } from "lucide-react";
import { RequirementSidebar } from "../../components/layout/RequirementSidebar";
import { LoadingState } from "../../components/common/LoadingState";
import { Spinner } from "../../components/common/Spinner";
import { TypingIndicator } from "../../components/common/TypingIndicator";
import { TypewriterText } from "../../components/common/Typewriter";
import { InlineWorkflowPanel } from "../../components/workflow/InlineWorkflowPanel";
import { StatusChip } from "../../components/common/StatusChip";
import { confirmRequirementFollowups, getRequirementDetail, reconcileRequirementFollowupConfirmation, streamRequirementDraft, streamRequirementMessage } from "../../services/agentSpecService";
import type { RequirementDetail } from "../../services/types";
import type { Navigate } from "../../types";

interface ChatPageProps {
  activeRequirementId: string | null;
  navigate: Navigate;
  setActiveRequirementId: (requirementId: string | null) => void;
}

const cachedRequirementDetails = new Map<string, RequirementDetail>();
const REQUIREMENTS_CHANGED_EVENT = "agentpro:requirements-changed";

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

function questionOptions(question: Record<string, unknown>) {
  const raw = question.options ?? question.choices ?? question.suggestions;
  if (Array.isArray(raw)) {
    const options = raw
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 4);
    if (options.length) return options;
  }
  return ["确认", "不适用"];
}

export function ChatPage({ activeRequirementId, navigate, setActiveRequirementId }: ChatPageProps) {
  const [draft, setDraft] = useState("");
  const [detail, setDetail] = useState<RequirementDetail | null>(activeRequirementId ? cachedRequirementDetails.get(activeRequirementId) ?? null : null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [animateMessageId, setAnimateMessageId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeRequirementId) {
      setDetail(null);
      setLoading(false);
      setAnimateMessageId(null);
      setAnswers({});
      setErrorMessage(null);
      setNoticeMessage(null);
      return undefined;
    }
    const requirementId = activeRequirementId;
    const cached = cachedRequirementDetails.get(requirementId);
    setDetail(cached ?? null);
    setAnimateMessageId(null);
    setAnswers({});
    setLoading(!cached);

    async function loadRequirement() {
      setErrorMessage(null);
      setNoticeMessage(null);
      try {
        const result = await getRequirementDetail(requirementId);
        cachedRequirementDetails.set(requirementId, result.data);
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
  }, [activeRequirementId]);

  const pendingQuestions = detail?.followupQuestions ?? [];

  // Keep the conversation pinned to the latest message while loading / thinking.
  useEffect(() => {
    scrollToBottom();
  }, [detail?.messages.length, sending, scrollToBottom, streamingText]);

  const confirmedCount = (detail?.decisions ?? []).filter((item) => item.confirmed).length;

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setPendingMessage(content);
    setStreamingText("");
    setDraft("");
    setErrorMessage(null);
    setNoticeMessage(null);
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
      cachedRequirementDetails.set(result.data.id, result.data);
      setActiveRequirementId(result.data.id);
      setAnimateMessageId(null);
      window.dispatchEvent(new Event(REQUIREMENTS_CHANGED_EVENT));
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
    const submittedDecisions = answeredDecisions;
    setConfirming(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const result = await confirmRequirementFollowups(activeRequirementId, submittedDecisions);
      cachedRequirementDetails.set(result.data.id, result.data);
      setDetail(result.data);
      window.dispatchEvent(new Event(REQUIREMENTS_CHANGED_EVENT));
      const assistantMessages = result.data.messages.filter((message) => message.role === "assistant");
      setAnimateMessageId(assistantMessages[assistantMessages.length - 1]?.id ?? null);
      setAnswers({});
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交回答失败";
      const reconciled = await reconcileRequirementFollowupConfirmation(activeRequirementId, submittedDecisions);
      if (reconciled.detail) {
        cachedRequirementDetails.set(reconciled.detail.id, reconciled.detail);
        setDetail(reconciled.detail);
        const assistantMessages = reconciled.detail.messages.filter((item) => item.role === "assistant");
        setAnimateMessageId(assistantMessages[assistantMessages.length - 1]?.id ?? null);
      }
      if (reconciled.accepted && reconciled.detail) {
        setAnswers({});
        setNoticeMessage("提交请求超时，但服务端已完成确认，已同步最新状态。");
      } else {
        setErrorMessage(reconciled.detail ? `${message}；已刷新服务端状态，但确认尚未完成。` : `${message}；自动刷新服务端状态失败，请稍后重试。`);
      }
    } finally {
      setConfirming(false);
    }
  };

  const currentQuestionIndex = pendingQuestions.findIndex((question, index) => {
    const key = questionKey(question, index);
    return !answers[key]?.trim();
  });
  const activeQuestionIndex = currentQuestionIndex >= 0 ? currentQuestionIndex : Math.max(0, pendingQuestions.length - 1);
  const activeQuestion = pendingQuestions[activeQuestionIndex] ?? null;
  const activeQuestionKey = activeQuestion ? questionKey(activeQuestion, activeQuestionIndex) : "";
  const activeQuestionValue = activeQuestion ? answers[activeQuestionKey] ?? "" : "";

  const handleMainInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSend();
  };

  const handleFollowupKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleConfirmFollowups();
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <RequirementSidebar activeRequirementId={activeRequirementId} navigate={navigate} setActiveRequirementId={setActiveRequirementId} />

      <section className="flex min-w-0 flex-1 flex-col bg-agent-bg">
        {detail ? <RequirementStatusTop detail={detail} confirmedCount={confirmedCount} pendingQuestions={pendingQuestions.length} /> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-4 pt-7">
          <div className="mx-auto max-w-[760px]">
            {loading && !detail ? <LoadingState label="正在读取需求..." /> : null}
            {!detail && !loading && !sending ? (
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
            {noticeMessage ? <div className="rounded-lg bg-[#ECFDF5] px-3 py-2 text-xs font-medium text-agent-success">{noticeMessage}</div> : null}
            {errorMessage ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
            {detail ? <InlineWorkflowPanel detail={detail} /> : null}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-agent-divider bg-white px-7 py-4">
          {detail && !sending && activeQuestion ? (
            <div className="mx-auto max-w-[760px]">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-agent-primary">
                    需要确认 {Math.min(answeredDecisions.length + 1, pendingQuestions.length)}/{pendingQuestions.length}
                  </div>
                  <div className="mt-1 text-[13px] font-medium leading-6 text-agent-ink">{questionText(activeQuestion)}</div>
                  {activeQuestion.reason ? <div className="mt-0.5 text-xs text-agent-muted">{String(activeQuestion.reason)}</div> : null}
                </div>
                <span className="shrink-0 text-xs text-agent-muted">Enter 确认，Shift+Enter 换行</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {questionOptions(activeQuestion).map((option) => (
                  <button
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeQuestionValue === option
                        ? "border-agent-primary bg-agent-pale text-agent-primary"
                        : "border-agent-border bg-white text-agent-secondary hover:border-agent-primary hover:text-agent-primary"
                    }`}
                    disabled={confirming}
                    key={option}
                    type="button"
                    onClick={() => setAnswers((current) => ({ ...current, [activeQuestionKey]: option }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2.5">
                <textarea
                  className="agent-input min-h-[42px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
                  disabled={confirming}
                  placeholder="也可以输入自定义回答..."
                  rows={1}
                  value={activeQuestionValue}
                  onChange={(event) => setAnswers((current) => ({ ...current, [activeQuestionKey]: event.target.value }))}
                  onKeyDown={handleFollowupKeyDown}
                />
                <button
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-agent-primary text-white hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={confirming || !answeredDecisions.length}
                  title="提交回答"
                  type="button"
                  onClick={() => void handleConfirmFollowups()}
                >
                  {confirming ? <Spinner size={18} className="text-white" /> : <Send size={18} />}
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[760px] items-end gap-2.5">
              <textarea
                className="agent-input min-h-[42px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
                disabled={sending}
                placeholder="描述你的想法，或回答上面的问题..."
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleMainInputKeyDown}
              />
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
          )}
        </div>
      </section>
    </div>
  );
}

function RequirementStatusTop({ detail, confirmedCount, pendingQuestions }: { detail: RequirementDetail; confirmedCount: number; pendingQuestions: number }) {
  const ready = pendingQuestions === 0;
  return (
    <div className="border-b border-agent-divider bg-white px-7 py-3">
      <div className="mx-auto flex max-w-[760px] items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="truncate text-sm font-semibold text-agent-ink">{detail.title}</div>
            <StatusChip tone={ready ? "cyan" : "orange"}>{ready ? "可进入 workflow" : "待确认"}</StatusChip>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-agent-divider">
              <div className="h-full rounded-full bg-gradient-to-r from-agent-primary to-agent-cyan" style={{ width: `${Math.max(0, Math.min(100, detail.maturity))}%` }} />
            </div>
            <span className="w-12 text-right text-sm font-bold text-agent-primary">{detail.maturity}%</span>
          </div>
        </div>
        <div className="hidden grid-cols-2 gap-2 text-xs sm:grid">
          <StatusMetric label="已确认" value={confirmedCount} />
          <StatusMetric label="待反问" value={pendingQuestions} />
        </div>
      </div>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[72px] rounded-lg bg-agent-bg px-3 py-2">
      <div className="text-[15px] font-bold text-agent-ink">{value}</div>
      <div className="text-[11px] text-agent-muted">{label}</div>
    </div>
  );
}
