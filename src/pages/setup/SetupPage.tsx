import { CheckCircle2, ChevronRight, DatabaseZap, KeyRound, ListChecks, ServerCog } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { AppCard } from "../../components/common/Card";
import type { Navigate } from "../../types";

interface SetupPageProps {
  navigate: Navigate;
}

const providers = [
  {
    title: "sub2api 中转",
    desc: "推荐。统一接入 OpenAI 格式模型，适合技术小白快速开始。",
    tag: "推荐",
    active: true,
    icon: ServerCog
  },
  {
    title: "OpenAI Compatible",
    desc: "适合已有兼容接口的团队，可配置 Base URL 与密钥。",
    tag: "兼容",
    active: false,
    icon: DatabaseZap
  },
  {
    title: "自定义服务",
    desc: "保留给企业代理网关、私有模型服务或本地模型。",
    tag: "高级",
    active: false,
    icon: KeyRound
  }
];

const modelOptions = ["claude-sonnet-4-20250514", "gpt-4o", "deepseek-chat"];

export function SetupPage({ navigate }: SetupPageProps) {
  return (
    <div className="min-h-full overflow-auto bg-agent-bg text-agent-ink">
      <header className="flex h-[64px] items-center justify-between border-b border-agent-divider bg-white px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-agent-primary text-base font-extrabold text-white">A</div>
          <div className="text-[21px] font-extrabold tracking-0 text-agent-ink">
            Agent<span className="text-agent-primary">Pro</span>
          </div>
        </div>
        <button className="text-sm font-medium text-agent-muted hover:text-agent-primary" type="button" onClick={() => navigate("login")}>
          返回登录
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[1040px] gap-7 px-8 py-12">
        <section className="min-w-0 flex-1">
          <div className="mb-8">
            <div className="text-[28px] font-extrabold text-agent-ink">选择你的 AI 模型服务</div>
            <p className="mt-2 max-w-[580px] text-sm leading-6 text-agent-muted">
              AgentPro 会使用 OpenAI 兼容格式调用模型。这里先完成连接配置，后续可在设置页随时更换。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {providers.map((provider) => {
              const Icon = provider.icon;
              return (
                <button
                  className={`relative min-h-[148px] rounded-[14px] border bg-white p-5 text-left shadow-agent-sm transition-all hover:-translate-y-0.5 hover:shadow-agent ${
                    provider.active ? "border-2 border-agent-primary" : "border-agent-border"
                  }`}
                  key={provider.title}
                  type="button"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <div className={`grid h-10 w-10 place-items-center rounded-[10px] ${provider.active ? "bg-agent-pale text-agent-primary" : "bg-[#F3F6FA] text-agent-muted"}`}>
                      <Icon size={19} />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${provider.active ? "bg-agent-primary text-white" : "bg-[#F0F4FA] text-agent-muted"}`}>
                      {provider.tag}
                    </span>
                  </div>
                  <div className="text-[15px] font-bold text-agent-ink">{provider.title}</div>
                  <div className="mt-2 text-xs leading-5 text-agent-muted">{provider.desc}</div>
                </button>
              );
            })}
          </div>

          <AppCard className="mt-6 p-6">
            <div className="mb-5 flex items-center justify-between border-b border-agent-divider pb-5">
              <div>
                <div className="text-lg font-bold text-agent-ink">模型连接配置</div>
                <div className="mt-1 text-xs text-agent-muted">当前选择：sub2api 中转服务</div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8FFF6] px-3 py-1.5 text-xs font-semibold text-agent-success">
                <CheckCircle2 size={15} />
                已检测兼容 OpenAI 格式
              </span>
            </div>

            <div className="grid gap-5">
              <label className="flex flex-col gap-[7px]">
                <span className="agent-label">Base URL</span>
                <input className="agent-input px-4 py-[11px] text-sm" defaultValue="https://api.sub2api.com/v1" />
              </label>
              <label className="flex flex-col gap-[7px]">
                <span className="agent-label">API Key</span>
                <input className="agent-input px-4 py-[11px] text-sm" placeholder="输入中转服务密钥，仅保存在本地安全配置" type="password" />
              </label>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <label className="flex flex-col gap-[7px]">
                  <span className="agent-label">默认模型</span>
                  <select className="agent-input px-4 py-[11px] text-sm" defaultValue={modelOptions[0]}>
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <AppButton className="h-[43px] px-5" type="button" variant="secondary">
                  测试连接
                </AppButton>
              </div>
              <div className="flex items-center justify-between rounded-[10px] border border-[#CBEEDB] bg-[#F0FFF7] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-agent-success">
                  <ListChecks size={18} />
                  已自动获取模型列表
                </div>
                <span className="text-xs text-agent-muted">3 个可用模型</span>
              </div>
            </div>

            <div className="mt-7 flex justify-end gap-3">
              <AppButton type="button" variant="ghost" onClick={() => navigate("login")}>
                稍后配置
              </AppButton>
              <AppButton className="inline-flex items-center gap-2" type="button" onClick={() => navigate("chat")}>
                进入工作台
                <ChevronRight size={16} />
              </AppButton>
            </div>
          </AppCard>
        </section>

        <aside className="w-[280px] pt-[75px]">
          <div className="grid gap-4">
            {[
              ["什么是 Base URL", "模型服务的统一调用入口。sub2api 已提供兼容 OpenAI 的地址。"],
              ["API Key 存放在哪里", "正式版本会写入本地安全存储或系统密钥链，不会提交到 Git。"],
              ["模型怎么选", "默认建议选择推理与稳定性更均衡的模型，后续可按任务切换。"]
            ].map(([title, desc]) => (
              <AppCard className="p-5" key={title}>
                <div className="text-[14px] font-bold text-agent-ink">{title}</div>
                <div className="mt-2 text-xs leading-5 text-agent-muted">{desc}</div>
              </AppCard>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
