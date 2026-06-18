interface TypingIndicatorProps {
  className?: string;
  /** Optional label shown before the dots, e.g. "正在思考". */
  label?: string;
}

/**
 * Three-dot "thinking" animation used while the assistant is generating a reply.
 */
export function TypingIndicator({ className = "", label }: TypingIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-label={label ?? "正在思考"}>
      {label ? <span className="text-[13px] text-agent-muted">{label}</span> : null}
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-agent-primary animate-agent-bounce"
            style={{ animationDelay: `${index * 0.16}s` }}
          />
        ))}
      </span>
    </span>
  );
}
