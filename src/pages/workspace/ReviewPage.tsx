import { AppButton } from "../../components/common/Button";
import type { Navigate } from "../../types";

interface ReviewPageProps {
  navigate: Navigate;
}

const dimensions = [
  ["功能完成度", 85, 92, false],
  ["测试覆盖", 78, 88, false],
  ["性能表现", 90, 85, false],
  ["稳定性", 82, 91, false],
  ["幻觉风险", 30, 15, true],
  ["安全风险", 20, 10, true],
  ["需求一致性", 88, 94, false]
] as const;

const findings = [
  ["阻塞", "Codex 方案的退款操作缺少金额校验，存在幻觉导致的超额退款风险", "bg-agent-danger", "bg-[#FEF2F2]"],
  ["建议", "Claude 方案的错误提示信息可以更加用户友好，避免使用技术术语", "bg-agent-warning", "bg-[#FFF7ED]"],
  ["优点", "Claude 方案实现了完整的对话记忆机制，能准确关联历史订单信息", "bg-agent-success", "bg-[#ECFDF5]"]
] as const;

export function ReviewPage({ navigate }: ReviewPageProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[1020px]">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">自动评审报告</h1>
            <div className="mt-1 text-[13px] text-agent-muted">自动客服 Agent · 候选方案对比</div>
          </div>
          <div className="flex gap-2.5">
            <AppButton type="button" variant="secondary">
              要求返工
            </AppButton>
            <AppButton type="button" variant="secondary">
              合并优点
            </AppButton>
            <AppButton type="button" onClick={() => navigate("library")}>
              采纳推荐方案
            </AppButton>
          </div>
        </div>

        <div className="mb-7 grid grid-cols-2 gap-5">
          <SummaryCard code="Cx" desc="功能完成度较高，但测试覆盖和安全性有提升空间。代码结构清晰，便于维护。" score={76} title="Codex 方案" />
          <SummaryCard code="Cl" desc="各维度均衡，安全措施完善，幻觉防护充分。测试覆盖率高，推荐采纳。" recommended score={88} title="Claude Code 方案" />
        </div>

        <div className="mb-6 rounded-xl border border-agent-border bg-white p-7">
          <div className="mb-1.5 text-base font-semibold text-agent-ink">维度评分对比</div>
          <div className="mb-6 flex gap-4 text-xs text-agent-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] bg-agent-ink" />
              Codex
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] bg-[#D97757]" />
              Claude Code
            </span>
          </div>
          <div className="grid gap-5">
            {dimensions.map(([name, codex, claude, lowerBetter]) => (
              <div key={name}>
                <div className="mb-2 flex justify-between">
                  <span className="text-[13px] font-medium text-agent-secondary">
                    {name} {lowerBetter ? <span className="text-[11px] font-normal text-agent-subtle">(越低越好)</span> : null}
                  </span>
                  <div className="flex gap-5">
                    <span className={`w-10 text-right text-xs font-semibold ${lowerBetter && codex > claude ? "text-agent-danger" : "text-agent-ink"}`}>{codex}</span>
                    <span className={`w-10 text-right text-xs font-semibold ${lowerBetter ? "text-agent-success" : "text-[#D97757]"}`}>{claude}</span>
                  </div>
                </div>
                <ScoreBar value={codex} color={lowerBetter ? "bg-agent-danger" : "bg-agent-ink"} />
                <div className="mt-1">
                  <ScoreBar value={claude} color={lowerBetter ? "bg-agent-success" : "bg-[#D97757]"} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-agent-border bg-white p-6">
          <div className="mb-4 text-base font-semibold text-agent-ink">评审发现</div>
          <div className="grid gap-3">
            {findings.map(([label, text, labelBg, boxBg]) => (
              <div className={`flex items-start gap-3 rounded-[10px] p-3.5 ${boxBg}`} key={label}>
                <span className={`shrink-0 rounded-lg px-2.5 py-[3px] text-[11px] font-semibold text-white ${labelBg}`}>{label}</span>
                <div className="text-[13px] leading-6 text-agent-secondary">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ code, title, score, desc, recommended = false }: { code: string; title: string; score: number; desc: string; recommended?: boolean }) {
  return (
    <div className={`relative rounded-xl bg-white p-6 ${recommended ? "border-2 border-agent-primary" : "border border-agent-border"}`}>
      {recommended ? <span className="absolute right-3.5 top-[-1px] rounded-b-lg bg-agent-primary px-3 py-[3px] text-[11px] font-semibold text-white">推荐采纳</span> : null}
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`grid h-[34px] w-[34px] place-items-center rounded-[9px] text-xs font-bold text-white ${code === "Cx" ? "bg-agent-ink" : "bg-[#D97757]"}`}>{code}</div>
          <span className="text-base font-semibold text-agent-ink">{title}</span>
        </div>
        <span className="text-[28px] font-bold text-agent-primary">
          {score}
          <span className="text-sm font-normal text-agent-muted">/100</span>
        </span>
      </div>
      <div className="text-[13px] leading-6 text-agent-muted">{desc}</div>
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex h-2 gap-1">
      <div className={`rounded ${color}`} style={{ flex: value }} />
      <div className="rounded bg-agent-divider" style={{ flex: 100 - value }} />
    </div>
  );
}
