import type { ReactNode } from "react";

interface AuthLayoutProps {
  caption: ReactNode;
  children: ReactNode;
}

export function AuthLayout({ caption, children }: AuthLayoutProps) {
  return (
    <div className="flex h-screen w-full">
      <div className="relative flex w-[46%] flex-col items-center justify-center overflow-hidden bg-agent-ink">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(21,94,239,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(21,94,239,0.06) 1px, transparent 1px)",
            backgroundSize: "52px 52px"
          }}
        />
        <div className="absolute left-[28%] top-[18%] h-1.5 w-1.5 animate-agent-pulse rounded-full bg-agent-primary shadow-[0_0_16px_4px_rgba(21,94,239,0.4)]" />
        <div className="absolute left-[65%] top-[52%] h-[5px] w-[5px] animate-agent-pulse rounded-full bg-agent-cyan shadow-[0_0_14px_3px_rgba(43,179,214,0.4)] [animation-delay:1s]" />
        <div className="absolute left-[22%] top-[72%] h-1 w-1 animate-agent-pulse rounded-full bg-agent-cyan shadow-[0_0_12px_3px_rgba(43,179,214,0.35)] [animation-delay:2s]" />
        <div className="absolute left-[78%] top-[30%] h-[5px] w-[5px] animate-agent-pulse rounded-full bg-agent-primary shadow-[0_0_14px_3px_rgba(21,94,239,0.35)] [animation-delay:.5s]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.08]" viewBox="0 0 600 900">
          <line x1="168" y1="162" x2="390" y2="468" stroke="#155EEF" strokeWidth="1" />
          <line x1="390" y1="468" x2="132" y2="648" stroke="#2BB3D6" strokeWidth="1" />
          <line x1="468" y1="270" x2="390" y2="468" stroke="#155EEF" strokeWidth="1" />
        </svg>
        <div className="relative z-10 text-center">
          <div className="text-[44px] font-extrabold tracking-[-1.5px] text-white">
            Agent<span className="text-[#4B8BF5]">Pro</span>
          </div>
          <div className="mt-4 max-w-[320px] text-[15px] leading-[1.7] text-white/45">{caption}</div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-y-auto bg-agent-bg px-6 py-10">{children}</div>
    </div>
  );
}

