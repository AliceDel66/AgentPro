interface AgentProLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export function AgentProLogo({ size = 34, showWordmark = false, className = "" }: AgentProLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg aria-hidden="true" height={size} viewBox="0 0 64 64" width={size}>
        <defs>
          <linearGradient id="agentpro-logo-gradient" x1="12" x2="52" y1="10" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#155EEF" />
            <stop offset="1" stopColor="#2BB3D6" />
          </linearGradient>
        </defs>
        <rect fill="#0B1220" height="56" rx="15" width="56" x="4" y="4" />
        <path
          d="M19 42L29.4 18h5.2L45 42h-6.1l-2-5.2H27.1L25 42h-6Zm10.1-10.4h5.8L32 24.1l-2.9 7.5Z"
          fill="url(#agentpro-logo-gradient)"
        />
        <path d="M16 17h8M40 17h8M16 47h8M40 47h8M17 16v8M47 16v8M17 40v8M47 40v8" stroke="#7DD3FC" strokeLinecap="round" strokeWidth="2" />
        <circle cx="32" cy="32" fill="#EAF3FF" r="2.3" />
      </svg>
      {showWordmark ? (
        <span className="text-[17px] font-extrabold tracking-normal text-agent-ink">
          Agent<span className="text-agent-primary">Pro</span>
        </span>
      ) : null}
    </div>
  );
}
