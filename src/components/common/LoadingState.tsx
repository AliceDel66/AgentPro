import { Spinner } from "./Spinner";

interface LoadingStateProps {
  label?: string;
  className?: string;
  size?: number;
}

/**
 * Inline "section is loading" indicator: a spinner next to a short label.
 * Use inside lists, panels and headers while data is being fetched.
 */
export function LoadingState({ label = "加载中...", className = "", size = 18 }: LoadingStateProps) {
  return (
    <div className={`flex items-center gap-2.5 text-sm text-agent-muted ${className}`} role="status" aria-live="polite">
      <Spinner size={size} className="text-agent-primary" />
      <span>{label}</span>
    </div>
  );
}
