import type { HTMLAttributes, ReactNode } from "react";

interface AppCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function AppCard({ className = "", children, ...props }: AppCardProps) {
  return (
    <div className={`rounded-xl border border-agent-border bg-white shadow-agent-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

