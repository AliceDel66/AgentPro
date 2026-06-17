import type { InputHTMLAttributes, ReactNode } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  action?: ReactNode;
  hint?: ReactNode;
}

export function TextField({ label, action, hint, className = "", ...props }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className="flex items-center justify-between">
        <span className="agent-label">{label}</span>
        {action}
      </span>
      <input className={`agent-input px-4 py-[11px] text-sm ${className}`} {...props} />
      {hint ? <span className="text-xs text-agent-subtle">{hint}</span> : null}
    </label>
  );
}

