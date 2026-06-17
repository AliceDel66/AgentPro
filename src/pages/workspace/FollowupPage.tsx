import { Bot, Check, CircleAlert } from "lucide-react";
import { RequirementSidebar } from "../../components/layout/RequirementSidebar";
import type { Navigate } from "../../types";

interface FollowupPageProps {
  navigate: Navigate;
}

const decisionGroups = [
  {
    title: "决策 1：是否需要自动调用订单系统？",
    desc: "这决定了 Agent 能否直接处理退款、修改订单等操作",
    options: [
      ["需要自动调用", "Agent 可直接退款、查订单。效率高但需严格安全审查", true],
      ["仅查询和引导", "Agent 只回答问题和指引步骤。更安全但需人工操作", false],
      ["后续再说", "先跳过，之后在需求草案中再补充", false]
    ]
  },
  {
    title: "决策 2：无法处理时的转接方式？",
    desc: "Agent 判断问题超出能力范围时的处理策略",
    options: [
      ["自动转接，附带对话摘要", "Agent 生成摘要后无缝交接给客服人员", false],
      ["提供入口，用户自行选择", "Agent 提示用户是否需要人工帮助，由用户决定", false]
    ]
  }
] as const;

export function FollowupPage({ navigate }: FollowupPageProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <RequirementSidebar navigate={navigate} />

      <section className="flex min-w-0 flex-1 flex-col bg-agent-bg">
        <div className="min-h-0 flex-1 overflow-y-auto p-7">
          <div className="mb-6 rounded-xl border border-agent-border bg-white px-5 py-4">
            <div className="mb-1.5 text-xs font-medium text-agent-subtle">对话摘要</div>
            <div className="text-[13px] leading-6 text-agent-secondary">
              你正在规划一个自动客服 Agent，用于电商售后场景。已确认 3 个基本信息，还有 3 个关键决策需要你确认。
            </div>
          </div>

          <div className="flex gap-3">
            <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-agent-ink text-agent-cyan">
              <Bot size={17} />
            </div>
            <div className="min-w-0 flex-1 max-w-[600px]">
              <div className="mb-4 rounded-[4px_16px_16px_16px] border border-agent-border bg-white px-[22px] py-[18px] text-sm leading-7 text-agent-secondary shadow-[0_1px_4px_rgba(11,18,32,0.04)]">
                基于我们的对话，我整理了一些需要你确认的选项。每个决定都会影响 Agent 的最终设计：
              </div>

              {decisionGroups.map((group) => (
                <div className="mb-3.5 rounded-xl border border-agent-border bg-white p-[22px]" key={group.title}>
                  <div className="mb-1 text-sm font-semibold text-agent-ink">{group.title}</div>
                  <div className="mb-4 text-xs text-agent-muted">{group.desc}</div>
                  <div className="grid gap-2.5">
                    {group.options.map(([title, desc, active]) => (
                      <button
                        className={`flex items-center gap-3 rounded-[10px] px-4 py-3 text-left transition-colors ${
                          active ? "border-2 border-agent-primary bg-[#F8FAFF]" : "border border-agent-border hover:border-agent-primary"
                        }`}
                        key={title}
                        type="button"
                      >
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${active ? "border-agent-primary" : "border-agent-border"}`}>
                          {active ? <span className="h-2 w-2 rounded-full bg-agent-primary" /> : null}
                        </span>
                        <span>
                          <span className="block text-[13px] font-medium text-agent-ink">{title}</span>
                          <span className="mt-0.5 block text-[11px] leading-5 text-agent-muted">{desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-agent-divider bg-white px-7 py-4">
          <div className="flex gap-2.5">
            <textarea className="agent-input min-h-[42px] flex-1 resize-none rounded-xl px-[18px] py-3 text-sm" placeholder="也可以直接输入你的想法..." rows={1} />
            <button className="shrink-0 rounded-[10px] bg-agent-primary px-[22px] text-[13px] font-semibold text-white hover:bg-agent-primaryHover" type="button" onClick={() => navigate("spec")}>
              确认选择
            </button>
          </div>
        </div>
      </section>

      <aside className="w-[280px] shrink-0 overflow-y-auto border-l border-agent-divider bg-white">
        <div className="border-b border-agent-divider px-5 py-[18px]">
          <div className="text-sm font-semibold text-agent-ink">已确认决策</div>
        </div>
        <div className="grid gap-3.5 p-5">
          <Panel tone="green" icon={<Check size={14} strokeWidth={2.5} />} title="操作权限">
            需要自动调用订单系统
          </Panel>
          <Panel tone="orange" icon={<CircleAlert size={14} />} title="待确认">
            转接方式、对话记忆范围
          </Panel>
          <div className="rounded-[10px] bg-agent-pale p-3.5">
            <div className="mb-1.5 text-xs font-semibold text-agent-primary">系统评估</div>
            <div className="text-xs leading-6 text-agent-secondary">选择自动调用后，安全评审会重点检查退款操作的幻觉防护</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Panel({ tone, icon, title, children }: { tone: "green" | "orange"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const styles = tone === "green" ? "bg-[#ECFDF5] text-agent-success" : "bg-[#FFF7ED] text-agent-warning";

  return (
    <div className={`rounded-[10px] p-3.5 ${styles.split(" ")[0]}`}>
      <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${styles.split(" ")[1]}`}>
        {icon}
        {title}
      </div>
      <div className="text-xs leading-6 text-agent-secondary">{children}</div>
    </div>
  );
}
