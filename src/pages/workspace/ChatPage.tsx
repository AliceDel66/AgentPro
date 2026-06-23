import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Check, ChevronDown, Send, X } from "lucide-react";
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

interface FollowupOption {
  label: string;
  value: string;
  description?: string;
}

function normalizeFollowupOption(item: unknown): FollowupOption | null {
  if (typeof item === "string") {
    const value = item.trim();
    return value ? { label: value, value } : null;
  }
  if (item && typeof item === "object") {
    const option = item as Record<string, unknown>;
    const label = String(option.label ?? option.title ?? option.value ?? "").trim();
    const value = String(option.value ?? label).trim();
    const description = String(option.description ?? option.desc ?? option.reason ?? "").trim();
    if (!label || !value) return null;
    return { label, value, description: description || undefined };
  }
  return null;
}

function questionOptions(question: Record<string, unknown>): FollowupOption[] {
  const raw = question.options ?? question.choices ?? question.suggestions;
  if (Array.isArray(raw)) {
    const options = raw
      .map(normalizeFollowupOption)
      .filter((item): item is FollowupOption => Boolean(item))
      .slice(0, 4);
    if (options.length) return options;
  }
  return [
    { label: "确认", value: "确认" },
    { label: "不适用", value: "不适用" }
  ];
}

function isOptionValue(value: string, options: FollowupOption[]) {
  return options.some((option) => option.value === value);
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
  const [currentFollowupIndex, setCurrentFollowupIndex] = useState(0);
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
      setCurrentFollowupIndex(0);
      setErrorMessage(null);
      setNoticeMessage(null);
      return undefined;
    }
    const requirementId = activeRequirementId;
    const cached = cachedRequirementDetails.get(requirementId);
    setDetail(cached ?? null);
    setAnimateMessageId(null);
    setAnswers({});
    setCurrentFollowupIndex(0);
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

  useEffect(() => {
    if (!pendingQuestions.length) {
      setCurrentFollowupIndex(0);
      return;
    }
    setCurrentFollowupIndex((index) => Math.min(index, pendingQuestions.length - 1));
  }, [pendingQuestions.length]);

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

  const submitFollowupDecisions = async (submittedDecisions: Array<Record<string, unknown>>) => {
    if (!activeRequirementId || confirming || !submittedDecisions.length) return;
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
      setCurrentFollowupIndex(0);
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
        setCurrentFollowupIndex(0);
        setNoticeMessage("提交请求超时，但服务端已完成确认，已同步最新状态。");
      } else {
        setErrorMessage(reconciled.detail ? `${message}；已刷新服务端状态，但确认尚未完成。` : `${message}；自动刷新服务端状态失败，请稍后重试。`);
      }
    } finally {
      setConfirming(false);
    }
  };

  const activeQuestionIndex = Math.min(currentFollowupIndex, Math.max(0, pendingQuestions.length - 1));
  const activeQuestion = pendingQuestions[activeQuestionIndex] ?? null;
  const activeQuestionKey = activeQuestion ? questionKey(activeQuestion, activeQuestionIndex) : "";
  const activeQuestionValue = activeQuestion ? answers[activeQuestionKey] ?? "" : "";
  const activeQuestionOptions = activeQuestion ? questionOptions(activeQuestion) : [];
  const customAnswerValue = activeQuestionValue && !isOptionValue(activeQuestionValue, activeQuestionOptions) ? activeQuestionValue : "";

  const selectActiveAnswer = (value: string) => {
    if (!activeQuestionKey) return;
    setAnswers((current) => ({ ...current, [activeQuestionKey]: value }));
  };

  const handleSubmitActiveFollowup = async () => {
    if (!activeQuestion || !activeQuestionValue.trim()) return;
    await submitFollowupDecisions([
      {
        key: activeQuestionKey,
        value: activeQuestionValue.trim(),
        confirmed: true
      }
    ]);
  };

  const handleSkipActiveFollowup = async () => {
    if (!activeQuestion) return;
    selectActiveAnswer("不适用");
    await submitFollowupDecisions([
      {
        key: activeQuestionKey,
        value: "不适用",
        confirmed: true
      }
    ]);
  };

  const handleMainInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSend();
  };

  const handleFollowupKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSubmitActiveFollowup();
  };

  const handleFollowupPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!activeQuestionOptions.length || event.target instanceof HTMLTextAreaElement) return;
    const optionIndex = Number(event.key) - 1;
    if (Number.isInteger(optionIndex) && activeQuestionOptions[optionIndex]) {
      event.preventDefault();
      selectActiveAnswer(activeQuestionOptions[optionIndex].value);
      return;
    }
    if (event.key === "Enter" && activeQuestionValue.trim()) {
      event.preventDefault();
      void handleSubmitActiveFollowup();
    }
  };

  useEffect(() => {
    if (!activeQuestion || sending || confirming) return undefined;
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const optionIndex = Number(event.key) - 1;
      if (Number.isInteger(optionIndex) && activeQuestionOptions[optionIndex]) {
        event.preventDefault();
        selectActiveAnswer(activeQuestionOptions[optionIndex].value);
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [activeQuestion, activeQuestionOptions, confirming, sending]);

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
            <div className="mx-auto max-w-[940px]">
              <div
                className="mb-2 rounded-xl border border-agent-border bg-white p-3.5 shadow-[0_8px_24px_rgba(11,18,32,0.07)]"
                tabIndex={0}
                onKeyDown={handleFollowupPanelKeyDown}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-agent-ink">
                      <span className="rounded-md bg-[#F7EFCB] px-1.5 py-0.5 text-[11px] font-bold text-[#9A7A16]">
                        {activeQuestionIndex + 1}/{pendingQuestions.length}
                      </span>
                      <span className="leading-6">{questionText(activeQuestion)}</span>
                    </div>
                    {activeQuestion.reason ? <div className="mt-1 text-xs leading-5 text-agent-muted">{String(activeQuestion.reason)}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      className="grid h-7 w-7 place-items-center rounded-md bg-agent-bg text-agent-muted hover:text-agent-primary"
                      title="收起"
                      type="button"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      className="grid h-7 w-7 place-items-center rounded-md text-agent-muted hover:bg-red-50 hover:text-agent-danger"
                      title="跳过"
                      type="button"
                      onClick={() => void handleSkipActiveFollowup()}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-agent-divider">
                  {activeQuestionOptions.map((option, index) => {
                    const selected = activeQuestionValue === option.value;
                    return (
                      <button
                        className={`flex w-full items-center gap-3 border-b border-agent-divider px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                          selected ? "bg-agent-pale" : "bg-[#F7F7F7] hover:bg-agent-bg"
                        }`}
                        disabled={confirming}
                        key={`${option.value}-${index}`}
                        type="button"
                        onClick={() => selectActiveAnswer(option.value)}
                      >
                        <span className={`min-w-0 flex-1 ${selected ? "text-agent-primary" : "text-agent-ink"}`}>
                          <span className="block text-[13px] font-semibold leading-5">{option.label}</span>
                          {option.description ? <span className="mt-0.5 block text-xs leading-5 text-agent-muted">{option.description}</span> : null}
                        </span>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold ${
                          selected ? "border-agent-primary bg-white text-agent-primary" : "border-agent-border bg-white text-agent-muted"
                        }`}>
                          {selected ? <Check size={13} strokeWidth={2.5} /> : index + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-[13px] font-semibold text-agent-ink">Other</div>
                <textarea
                  className="agent-input mt-2 min-h-[40px] w-full resize-none rounded-lg px-3.5 py-2.5 text-sm leading-6"
                  disabled={confirming}
                  placeholder="Type your own answer here"
                  rows={1}
                  value={customAnswerValue}
                  onChange={(event) => selectActiveAnswer(event.target.value)}
                  onKeyDown={handleFollowupKeyDown}
                />

                <div className="mt-3 flex items-center justify-between">
                  <button
                    className="rounded-lg border border-agent-border bg-white px-3 py-1.5 text-xs font-semibold text-agent-secondary shadow-sm hover:border-agent-primary hover:text-agent-primary disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={confirming || activeQuestionIndex === 0}
                    type="button"
                    onClick={() => setCurrentFollowupIndex((index) => Math.max(0, index - 1))}
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-agent-border bg-white px-3 py-1.5 text-xs font-semibold text-agent-secondary shadow-sm hover:border-agent-primary hover:text-agent-primary disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={confirming}
                      type="button"
                      onClick={() => void handleSkipActiveFollowup()}
                    >
                      Skip
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg bg-agent-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:bg-agent-divider disabled:text-agent-subtle"
                      disabled={confirming || !activeQuestionValue.trim()}
                      type="button"
                      onClick={() => void handleSubmitActiveFollowup()}
                    >
                      {confirming ? <Spinner size={13} className="text-white" /> : null}
                      Submit
                      <span className="text-[11px] opacity-75">↵</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2.5">
                <textarea
                  className="agent-input min-h-[42px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
                  disabled
                  placeholder="先完成上方确认项..."
                  rows={1}
                />
                <button
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-agent-primary text-white opacity-45"
                  disabled
                  title="先完成上方确认项"
                  type="button"
                >
                  <Send size={18} />
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
