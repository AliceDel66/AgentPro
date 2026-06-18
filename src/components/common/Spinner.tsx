interface SpinnerProps {
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}

/**
 * Lightweight loading spinner. Inherits text color via `border-current`,
 * so set the color with a `text-*` class on the element or a parent.
 */
export function Spinner({ size = 16, className = "" }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-agent-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
