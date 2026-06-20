import { AlertTriangle, RefreshCw, Server } from "lucide-react";
import { AppButton } from "./Button";
import { Spinner } from "./Spinner";
import { DESKTOP_CONTRACT_VERSION, type BackendContractCheck } from "../../services/healthService";

interface BackendContractGateProps {
  checking?: boolean;
  check?: BackendContractCheck;
  onRetry: () => void;
}

export function BackendContractGate({ checking = false, check, onRetry }: BackendContractGateProps) {
  const health = check?.health;

  return (
    <div className="grid min-h-screen w-full place-items-center bg-agent-bg px-6">
      <section className="w-full max-w-[720px] rounded-[18px] border border-agent-border bg-white p-8 shadow-[0_24px_80px_rgba(25,65,140,0.10)]">
        <div className="flex items-start gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-[14px] ${checking ? "bg-agent-pale text-agent-primary" : "bg-red-50 text-agent-danger"}`}>
            {checking ? <Spinner size={22} className="text-agent-primary" /> : <AlertTriangle size={22} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-agent-muted">AgentPro Startup Check</p>
            <h1 className="mt-2 text-[24px] font-bold leading-tight text-agent-text">
              {checking ? "正在检查后端与桌面端版本..." : check?.title ?? "后端版本检查失败"}
            </h1>
            <p className="mt-3 text-[14px] leading-7 text-agent-muted">
              {checking
                ? "AgentPro 会先确认后端契约版本和必要能力集，确认通过后再恢复登录状态。"
                : check?.message ?? "请确认后端服务已启动并与当前桌面端版本匹配。"}
            </p>
          </div>
        </div>

        {!checking ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 rounded-[14px] border border-agent-border bg-agent-soft p-4 text-[13px] text-agent-muted md:grid-cols-2">
              <InfoLine label="桌面端契约" value={`v${DESKTOP_CONTRACT_VERSION}`} />
              <InfoLine label="后端版本" value={health?.version ?? "未读取"} />
              <InfoLine label="后端契约" value={typeof health?.contractVersion === "number" ? `v${health.contractVersion}` : "缺失"} />
              <InfoLine
                label="最低桌面端"
                value={typeof health?.minDesktopContractVersion === "number" ? `v${health.minDesktopContractVersion}` : "未声明"}
              />
            </div>

            {check?.issues.length ? (
              <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-amber-800">
                  <Server size={16} />
                  需要处理的问题
                </div>
                <ul className="space-y-2">
                  {check.issues.map((issue) => (
                    <li key={issue.code} className="rounded-[10px] bg-white px-3 py-2 text-[13px] leading-6 text-amber-900">
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] leading-6 text-agent-muted">
                常见原因：后端代码已更新但本地 FastAPI 进程还没重启，或桌面端仍是旧打包版本。
              </p>
              <AppButton type="button" onClick={onRetry} className="px-4 py-2.5">
                <RefreshCw size={16} />
                重新检测
              </AppButton>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-agent-muted">{label}</div>
      <div className="mt-1 truncate font-semibold text-agent-text">{value}</div>
    </div>
  );
}
