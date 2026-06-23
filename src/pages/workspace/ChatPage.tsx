import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Check, Send } from "lucide-react";
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
const GENERIC_FOLLOWUP_OPTION_VALUES = new Set([
  "确认",
  "适用",
  "不适用",
  "用户已确认",
  "需要确认",
  "个人自己使用",
  "团队成员使用",
  "多个角色都使用",
  "代码仓库/提交记录",
  "任务系统/文档",
  "聊天记录/日报周报",
  "只分析和建议",
  "允许创建草稿",
  "允许执行低风险动作",
  "节省时间",
  "提高准确率",
  "提升采纳率",
  "暂停并询问我",
  "给出风险说明",
  "转人工复核",
  "用户手动上传",
  "读取内部系统",
  "使用本地文件夹"
]);

function titleFromMessage(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized || "未命名需求";
}

function questionText(question: Record<string, unknown>) {
  return String(question.question ?? question.title ?? question.key ?? "待回答问题");
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
    return raw
      .map(normalizeFollowupOption)
      .filter((item): item is FollowupOption => Boolean(item))
      .filter((item) => !GENERIC_FOLLOWUP_OPTION_VALUES.has(item.value))
      .slice(0, 4);
  }
  return [];
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

  const answeredFollowupCount = pendingQuestions.filter((question, index) => {
    const key = questionKey(question, index);
    return Boolean((answers[key] ?? "").trim());
  }).length;
  const allFollowupsAnswered = pendingQuestions.length > 0 && answeredFollowupCount === pendingQuestions.length;

  const updateFollowupAnswer = (key: string, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  const handleSubmitAllFollowups = async () => {
    if (!allFollowupsAnswered) return;
    const decisions = pendingQuestions.map((question, index) => {
      const key = questionKey(question, index);
      return {
        key,
        value: (answers[key] ?? "").trim(),
        confirmed: true
      };
    });
    await submitFollowupDecisions(decisions);
  };

  const handleMainInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSend();
  };

  const handleFollowupKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    void handleSubmitAllFollowups();
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
          {detail && !sending && pendingQuestions.length > 0 ? (
            <div className="mx-auto max-w-[940px]">
              <div className="mb-2 rounded-xl border border-agent-border bg-white p-3.5 shadow-[0_8px_24px_rgba(11,18,32,0.07)]">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-agent-ink">需要补充这些问题后统一提交</div>
                    <div className="mt-1 text-xs leading-5 text-agent-muted">
                      已填写 {answeredFollowupCount}/{pendingQuestions.length}，每个问题会作为一条真实答案写入需求记录。
                    </div>
                  </div>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg bg-agent-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-agent-primaryHover disabled:cursor-not-allowed disabled:bg-agent-divider disabled:text-agent-subtle"
                    disabled={confirming || !allFollowupsAnswered}
                    type="button"
                    onClick={() => void handleSubmitAllFollowups()}
                  >
                    {confirming ? <Spinner size={13} className="text-white" /> : null}
                    提交 {pendingQuestions.length} 个回答
                    <span className="text-[11px] opacity-75">⌘↵</span>
                  </button>
                </div>

                <div className="max-h-[44vh] space-y-3 overflow-y-auto pr-1">
                  {pendingQuestions.map((question, index) => {
                    const key = questionKey(question, index);
                    const value = answers[key] ?? "";
                    const options = questionOptions(question);
                    return (
                      <div className="rounded-lg border border-agent-divider bg-[#F8FAFC] p-3" key={key}>
                        <div className="flex items-start gap-2.5">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-agent-pale text-[12px] font-bold text-agent-primary">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold leading-6 text-agent-ink">{questionText(question)}</div>
                            {question.reason ? <div className="mt-0.5 text-xs leading-5 text-agent-muted">{String(question.reason)}</div> : null}
                          </div>
                        </div>

                        {options.length ? (
                          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                            {options.map((option, optionIndex) => {
                              const selected = value.trim() === option.value;
                              return (
                                <button
                                  className={`flex min-h-[38px] items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors ${
                                    selected
                                      ? "border-agent-primary bg-white text-agent-primary"
                                      : "border-agent-border bg-white text-agent-secondary hover:border-agent-primary hover:bg-agent-pale"
                                  }`}
                                  disabled={confirming}
                                  key={`${key}-${option.value}-${optionIndex}`}
                                  type="button"
                                  onClick={() => updateFollowupAnswer(key, option.value)}
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-semibold leading-5">{option.label}</span>
                                    {option.description ? <span className="mt-0.5 block leading-5 text-agent-muted">{option.description}</span> : null}
                                  </span>
                                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                                    selected ? "border-agent-primary bg-agent-pale text-agent-primary" : "border-agent-border text-agent-muted"
                                  }`}>
                                    {selected ? <Check size={12} strokeWidth={2.5} /> : null}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        <textarea
                          className="agent-input mt-2 min-h-[54px] w-full resize-none rounded-lg px-3 py-2.5 text-sm leading-6"
                          disabled={confirming}
                          placeholder={options.length ? "可直接选择上方答案，也可以在这里改写..." : "在这里填写这道问题的答案..."}
                          rows={2}
                          value={value}
                          onChange={(event) => updateFollowupAnswer(key, event.target.value)}
                          onKeyDown={handleFollowupKeyDown}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-end gap-2.5">
                <textarea
                  className="agent-input min-h-[42px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
                  disabled
                  placeholder={`先完成上方 ${pendingQuestions.length} 个问题并统一提交...`}
                  rows={1}
                />
                <button
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-agent-primary text-white opacity-45"
                  disabled
                  title="先完成上方问题"
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
            <StatusChip tone={ready ? "cyan" : "orange"}>{ready ? "可进入 workflow" : "待回答"}</StatusChip>
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
          <StatusMetric label="待回答" value={pendingQuestions} />
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
