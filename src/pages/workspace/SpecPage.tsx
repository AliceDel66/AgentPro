import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { StatusChip } from "../../components/common/StatusChip";
import type { Navigate } from "../../types";

interface SpecPageProps {
  navigate: Navigate;
}

const sections = [
  {
    index: "1",
    title: "业务目标",
    body: "为中小电商平台提供 7x24 小时自动化售后客服能力，覆盖退换货、物流查询和投诉处理三大场景，降低人工客服成本 60% 以上，同时保证用户满意度不低于 85%。"
  },
  {
    index: "2",
    title: "目标用户",
    body: "电商平台终端消费者，25-45 岁网购用户。期望获得快速、准确的售后方案，对等待时间敏感。"
  },
  {
    index: "3",
    title: "核心场景",
    body: (
      <div className="grid gap-1.5">
        <div>
          <span className="font-semibold">退换货处理：</span>查询订单 → 确认原因 → 发起退款/换货 → 生成快递单号
        </div>
        <div>
          <span className="font-semibold">物流查询：</span>接收订单号 → 调用物流 API → 返回实时状态 → 异常主动提醒
        </div>
        <div>
          <span className="font-semibold">投诉处理：</span>识别类型 → 情绪安抚 → 提供方案 → 超出范围自动转人工
        </div>
      </div>
    )
  }
];

const tools = ["订单查询 API", "退款操作 API", "物流查询 API", "人工转接接口", "通知推送"];

export function SpecPage({ navigate }: SpecPageProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className="min-w-0 flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
        <div className="mx-auto max-w-[800px]">
          <div className="mb-6 flex items-center gap-3">
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">自动客服 Agent</h1>
            <StatusChip tone="blue">待审批</StatusChip>
          </div>
          <div className="-mt-4 mb-7 text-[13px] text-agent-muted">AgentSpec v0.1 · 最后更新 10 分钟前 · 基于 6 轮对话生成</div>

          <div className="overflow-hidden rounded-xl border border-agent-border bg-white">
            {sections.map((section) => (
              <SpecSection index={section.index} key={section.title} title={section.title}>
                {section.body}
              </SpecSection>
            ))}

            <SpecSection index="4" title="工具能力">
              <div className="flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <span className="rounded-lg bg-[#E6F7FB] px-3.5 py-1.5 text-xs font-medium text-agent-cyan" key={tool}>
                    {tool}
                  </span>
                ))}
              </div>
            </SpecSection>

            <SpecSection danger index="5" title="安全边界">
              <div className="grid gap-1">
                <div>• 单次退款上限 500 元，超出需人工审批</div>
                <div>• 不得泄露其他用户订单信息</div>
                <div>• 不处理与业务无关的对话</div>
                <div>• 所有操作日志保留 90 天</div>
              </div>
            </SpecSection>

            <div className="bg-[#FFF7ED] px-7 py-[22px]">
              <div className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-agent-warning">
                <AlertTriangle size={20} />
                未确认假设
              </div>
              <div className="pl-9 text-[13px] leading-8 text-agent-secondary">
                • 假设已有稳定的订单系统 API
                <br />
                • 假设平台已有人工客服排班系统
                <br />
                • 对话记忆范围暂定最近 10 轮
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="flex w-60 shrink-0 flex-col gap-3 border-l border-agent-divider bg-white px-[18px] py-6">
        <AppButton type="button" onClick={() => navigate("dispatch")}>
          确认并立即开发
        </AppButton>
        <AppButton type="button" variant="secondary" onClick={() => navigate("library")}>
          暂时存档
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={() => navigate("followup")}>
          继续澄清
        </AppButton>

        <div className="mt-4 rounded-[10px] bg-agent-bg p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-agent-ink">
            <CheckCircle2 size={16} className="text-agent-success" />
            草案完整度
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-agent-divider">
            <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-agent-primary to-agent-cyan" />
          </div>
          <div className="text-xs leading-6 text-agent-muted">已确认决策 4 项，仍有 3 项假设需要后续验证。</div>
        </div>

        <div className="mt-auto text-xs leading-8 text-agent-muted">
          版本：v0.1
          <br />
          创建：2026-06-17
          <br />
          对话轮次：6 轮
          <br />
          已确认决策：4 项
          <br />
          未确认假设：3 项
        </div>
      </aside>
    </div>
  );
}

function SpecSection({ index, title, children, danger = false }: { index: string; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div className="border-b border-agent-divider px-7 py-[22px]">
      <div className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-agent-ink">
        <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] text-xs font-bold ${danger ? "bg-[#FEF2F2] text-agent-danger" : "bg-agent-pale text-agent-primary"}`}>
          {index}
        </span>
        {title}
      </div>
      <div className="pl-9 text-[13px] leading-8 text-agent-secondary">{children}</div>
    </div>
  );
}
