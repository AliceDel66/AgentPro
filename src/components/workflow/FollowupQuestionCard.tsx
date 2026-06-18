import type { ChangeEvent } from "react";

interface FollowupQuestionCardProps {
  index: number;
  question: string;
  reason?: string;
  value: string;
  onChange: (value: string) => void;
  /** Quick "not applicable" action; when omitted the shortcut is hidden. */
  onMarkNA?: () => void;
  disabled?: boolean;
}

/**
 * A single clarification question the user can answer inline.
 * Used both in the chat flow and on the batch Followup page.
 */
export function FollowupQuestionCard({ index, question, reason, value, onChange, onMarkNA, disabled }: FollowupQuestionCardProps) {
  return (
    <div className="rounded-xl border border-agent-border bg-white p-4">
      <div className="mb-2 flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-agent-pale text-[11px] font-bold text-agent-primary">
          {index + 1}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-6 text-agent-ink">{question}</div>
          {reason ? <div className="mt-0.5 text-xs leading-5 text-agent-muted">{reason}</div> : null}
        </div>
      </div>
      <textarea
        className="agent-input min-h-[58px] w-full resize-none px-3.5 py-2.5 text-sm leading-6"
        placeholder="在此直接回答，或点击“不适用”"
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      />
      {onMarkNA ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="text-xs font-medium text-agent-muted hover:text-agent-primary disabled:opacity-60"
            disabled={disabled}
            onClick={onMarkNA}
          >
            不适用
          </button>
        </div>
      ) : null}
    </div>
  );
}
