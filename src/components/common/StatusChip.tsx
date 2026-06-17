import type { ReactNode } from "react";

type Tone = "blue" | "gray" | "cyan" | "purple" | "green" | "orange" | "red";

const tones: Record<Tone, string> = {
  blue: "bg-agent-pale text-agent-primary",
  gray: "bg-[#F0F2F5] text-agent-muted",
  cyan: "bg-[#E6F7FB] text-agent-cyan",
  purple: "bg-[#F0ECFF] text-agent-purple",
  green: "bg-[#ECFDF5] text-agent-success",
  orange: "bg-[#FFF7ED] text-agent-warning",
  red: "bg-[#FEF2F2] text-agent-danger"
};

interface StatusChipProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function StatusChip({ tone = "blue", children, className = "" }: StatusChipProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

