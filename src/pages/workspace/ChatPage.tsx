import { Bot, Send, Sparkles } from "lucide-react";
import { RequirementSidebar } from "../../components/layout/RequirementSidebar";
import { followupQuestions } from "../../lib/mockData";
import type { Navigate } from "../../types";

interface ChatPageProps {
  navigate: Navigate;
}

export function ChatPage({ navigate }: ChatPageProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <RequirementSidebar navigate={navigate} />

      <section className="flex min-w-0 flex-1 flex-col bg-agent-bg">
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-4 pt-7">
          <div className="mb-6 flex justify-end">
            <div className="max-w-[500px] rounded-[16px_16px_4px_16px] bg-agent-primary px-5 py-4 text-sm leading-7 text-white">
              我想做一个自动客服 Agent，能够处理常见的售后问题，比如退换货、物流查询和投诉处理。我们是一个中小电商平台，每天大约有 200-300 个客服咨询。
            </div>
          </div>

          <div className="mb-5 flex gap-3">
            <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-agent-ink text-agent-cyan">
              <Bot size={17} />
            </div>
            <div className="max-w-[560px] rounded-[4px_16px_16px_16px] border border-agent-border bg-white p-5 text-sm leading-8 text-agent-secondary shadow-[0_1px_4px_rgba(11,18,32,0.04)]">
              <div className="mb-3.5">收到！我来帮你梳理这个自动客服 Agent 的需求。</div>
              <div className="mb-4 rounded-[10px] bg-[#F0F7FF] px-[18px] py-3.5">
                <div className="mb-2 text-xs font-semibold tracking-[0.5px] text-agent-primary">已了解信息</div>
                <div className="text-[13px] leading-7 text-agent-secondary">
                  • 业务类型：电商平台售后客服
                  <br />
                  • 处理场景：退换货、物流查询、投诉处理
                  <br />
                  • 日均咨询量：200-300 条
                </div>
              </div>
              <div className="mb-2.5 text-sm font-semibold text-agent-ink">还需要确认几个关键点：</div>
              <div className="grid gap-2.5">
                {followupQuestions.map((question, index) => (
                  <div className="flex items-start gap-2.5" key={question}>
                    <span className="mt-0.5 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-agent-pale text-[11px] font-bold text-agent-primary">
                      {index + 1}
                    </span>
                    <span className="text-[13px] leading-6 text-agent-secondary">{question}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-agent-divider bg-white px-7 py-4">
          <div className="flex items-end gap-2.5">
            <textarea
              className="agent-input min-h-[42px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm leading-6"
              placeholder="描述你的想法，或回答上面的问题..."
              rows={1}
            />
            <button
              className="h-[42px] shrink-0 rounded-[10px] bg-agent-pale px-[18px] text-[13px] font-medium text-agent-primary hover:bg-agent-paleHover"
              type="button"
              onClick={() => navigate("followup")}
            >
              回答反问
            </button>
            <button
              className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-agent-primary text-white hover:bg-agent-primaryHover"
              title="发送"
              type="button"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </section>

      <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-agent-divider bg-white">
        <div className="border-b border-agent-divider px-5 py-[18px]">
          <div className="text-sm font-semibold text-agent-ink">需求成熟度</div>
          <div className="mt-0.5 text-xs text-agent-muted">当前需求的完整程度评估</div>
        </div>
        <div className="p-5">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[32px] font-bold text-agent-primary">45%</span>
            <span className="text-xs text-agent-muted">需要更多信息</span>
          </div>
          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-agent-divider">
            <div className="h-full w-[45%] rounded-full bg-gradient-to-r from-agent-primary to-agent-cyan" />
          </div>
          <div className="grid gap-3.5">
            <InfoBox tone="green" title="已确认 (3)">
              • 售后客服场景
              <br />
              • 日均 200-300 咨询
              <br />
              • 三大核心场景
            </InfoBox>
            <InfoBox tone="orange" title="待确认 (3)">
              • 是否需要操作权限
              <br />
              • 人工转接方式
              <br />
              • 对话记忆范围
            </InfoBox>
            <InfoBox tone="blue" title="系统建议">
              建议先明确 Agent 的操作权限边界，这会直接影响安全评审标准
            </InfoBox>
            <InfoBox tone="red" title="风险提醒">
              若 Agent 直接操作退款，需评估幻觉导致的误操作风险
            </InfoBox>
            <button
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-agent-primary px-4 py-3 text-[13px] font-semibold text-white hover:bg-agent-primaryHover"
              type="button"
              onClick={() => navigate("spec")}
            >
              <Sparkles size={16} />
              生成需求草案
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function InfoBox({ tone, title, children }: { tone: "green" | "orange" | "blue" | "red"; title: string; children: React.ReactNode }) {
  const toneClasses = {
    green: "bg-[#ECFDF5] text-agent-success",
    orange: "bg-[#FFF7ED] text-agent-warning",
    blue: "bg-agent-pale text-agent-primary",
    red: "bg-[#FEF2F2] text-agent-danger"
  };

  return (
    <div className={`rounded-[10px] p-3.5 ${toneClasses[tone].split(" ")[0]}`}>
      <div className={`mb-2 text-xs font-semibold ${toneClasses[tone].split(" ")[1]}`}>{title}</div>
      <div className="text-xs leading-7 text-agent-secondary">{children}</div>
    </div>
  );
}
