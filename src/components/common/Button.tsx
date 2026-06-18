import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "border-transparent bg-agent-primary text-white hover:bg-agent-primaryHover",
  secondary: "border-transparent bg-agent-pale text-agent-primary hover:bg-agent-paleHover",
  ghost: "border-agent-border bg-transparent text-agent-muted hover:border-agent-primary hover:text-agent-primary",
  danger: "border-transparent bg-agent-danger text-white hover:bg-red-600"
};

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** When true, shows a spinner and blocks clicks. */
  loading?: boolean;
  children: ReactNode;
}

export function AppButton({ variant = "primary", className = "", loading = false, disabled, children, ...props }: AppButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] border px-5 py-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Spinner size={15} className={variant === "secondary" || variant === "ghost" ? "text-current" : "text-white"} /> : null}
      {children}
    </button>
  );
}

