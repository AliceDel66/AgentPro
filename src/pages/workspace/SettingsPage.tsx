import { useEffect, useState } from "react";
import { CheckCircle2, Lock, Shield, TriangleAlert } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { getModelConfig } from "../../services/modelService";
import type { ModelProviderConfig } from "../../services/types";
import type { Navigate } from "../../types";

interface SettingsPageProps {
  navigate: Navigate;
}

export function SettingsPage({ navigate }: SettingsPageProps) {
  const [modelConfig, setModelConfig] = useState<ModelProviderConfig | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadModelConfig() {
      setLoadingModel(true);
      try {
        const result = await getModelConfig();
        if (!cancelled) setModelConfig(result.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取模型配置失败";
        if (!cancelled) setModelError(message);
      } finally {
        if (!cancelled) setLoadingModel(false);
      }
    }

    void loadModelConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
      <div className="mx-auto max-w-[780px]">
        <h1 className="m-0 mb-8 text-[22px] font-bold text-agent-ink">设置</h1>

        <Card title="账号信息">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-agent-primary text-lg font-semibold text-white">张</div>
            <div>
              <div className="text-[15px] font-semibold text-agent-ink">张明</div>
              <div className="text-[13px] text-agent-muted">zhang@example.com</div>
            </div>
            <StatusChip className="ml-auto" tone="green">
              已验证
            </StatusChip>
          </div>
          <div className="flex items-center gap-3 rounded-[10px] bg-[#F8FAFC] px-[18px] py-3.5">
            <CheckCircle2 size={16} className="text-agent-success" />
            <span className="text-[13px] text-agent-secondary">云端同步已开启 · 最后同步 3 分钟前</span>
          </div>
        </Card>

        <Card title="模型配置">
          {loadingModel ? <LoadingState className="py-1" label="正在读取模型配置..." /> : (
          <div className="grid grid-cols-[120px_1fr] items-center gap-x-5 gap-y-3.5 text-[13px]">
            <Label>Provider</Label>
            <Value>{modelConfig?.provider ?? "未配置"}</Value>
            <Label>Base URL</Label>
            <Value mono>{modelConfig?.baseUrl ?? "-"}</Value>
            <Label>API Key</Label>
            <Value mono>{modelConfig?.secretSaved ? "已安全保存，界面不显示完整密钥" : "未保存"}</Value>
            <Label>当前模型</Label>
            <Value>{modelConfig?.model ?? "-"}</Value>
            <Label>连接状态</Label>
            {modelError ? (
              <span className="font-medium text-agent-danger">{modelError}</span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-agent-success">
                <CheckCircle2 size={14} />
                {modelConfig?.secretSaved ? "已配置" : "待配置"}
              </span>
            )}
          </div>
          )}
          <div className="mt-[18px]">
            <AppButton type="button" variant="secondary" onClick={() => navigate("setup")}>
              修改配置
            </AppButton>
          </div>
        </Card>

        <Card title="Runner 配置">
          <Runner badge="可用" code="Cx" name="Codex Runner" sub="OpenAI Codex CLI" />
          <Runner badge="可用" code="Cl" name="Claude Code Runner" sub="Anthropic Claude Code" accent="claude" />
        </Card>

        <Card title="安全设置">
          <Security icon={<Lock size={18} />} title="数据隔离">
            敏感信息、业务数据和本地配置不会直接写入开发任务包。
          </Security>
          <Security icon={<Shield size={18} />} title="操作审计">
            所有开发和评审操作记录可追溯，日志保留 90 天。
          </Security>
          <Security icon={<TriangleAlert size={18} />} title="幻觉防护">
            自动评审包含幻觉风险检测，高风险操作需人工确认。
          </Security>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-xl border border-agent-border bg-white p-6">
      <div className="mb-5 text-base font-semibold text-agent-ink">{title}</div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-agent-muted">{children}</span>;
}

function Value({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <span className={`text-agent-ink ${mono ? "font-mono text-xs" : ""}`}>{children}</span>;
}

function Runner({ code, name, sub, badge, accent = "codex" }: { code: string; name: string; sub: string; badge: string; accent?: "codex" | "claude" }) {
  return (
    <div className="mb-3.5 flex items-center justify-between rounded-[10px] bg-[#F8FAFC] px-[18px] py-4 last:mb-0">
      <div className="flex items-center gap-3">
        <div className={`grid h-[34px] w-[34px] place-items-center rounded-[9px] text-xs font-bold text-white ${accent === "codex" ? "bg-agent-ink" : "bg-[#D97757]"}`}>{code}</div>
        <div>
          <div className="text-sm font-medium text-agent-ink">{name}</div>
          <div className="text-xs text-agent-muted">{sub}</div>
        </div>
      </div>
      <StatusChip tone="green">{badge}</StatusChip>
    </div>
  );
}

function Security({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-3 rounded-[10px] bg-[#F8FAFC] px-[18px] py-3.5 last:mb-0">
      <div className="text-agent-success">{icon}</div>
      <div>
        <div className="text-[13px] font-medium text-agent-ink">{title}</div>
        <div className="text-xs text-agent-muted">{children}</div>
      </div>
    </div>
  );
}
