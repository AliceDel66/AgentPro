import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, DatabaseZap, KeyRound, ListChecks, ServerCog, XCircle } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { AppCard } from "../../components/common/Card";
import { getModelConfig, saveModelConfig, testModelConfig } from "../../services/modelService";
import type { ModelProviderConfig } from "../../services/types";
import type { Navigate } from "../../types";

interface SetupPageProps {
  navigate: Navigate;
}

type Provider = ModelProviderConfig["provider"];

const providerLabels: Record<Provider, string> = {
  sub2api: "sub2api 中转服务",
  "openai-compatible": "OpenAI Compatible",
  custom: "自定义服务"
};

const providers: Array<{
  provider: Provider;
  title: string;
  desc: string;
  tag: string;
  icon: typeof ServerCog;
}> = [
  {
    provider: "sub2api",
    title: "sub2api 中转",
    desc: "推荐。统一接入 OpenAI 格式模型，适合技术小白快速开始。",
    tag: "推荐",
    icon: ServerCog
  },
  {
    provider: "openai-compatible",
    title: "OpenAI Compatible",
    desc: "适合已有兼容接口的团队，可配置 Base URL 与密钥。",
    tag: "兼容",
    icon: DatabaseZap
  },
  {
    provider: "custom",
    title: "自定义服务",
    desc: "保留给企业代理网关、私有模型服务或本地模型。",
    tag: "高级",
    icon: KeyRound
  }
];

const providerDefaultBaseUrls: Record<Provider, string> = {
  sub2api: "https://api.sub2api.com/v1",
  "openai-compatible": "https://api.openai.com/v1",
  custom: "https://your-model-gateway.example.com/v1"
};

function normalizeModels(models: string[]) {
  const deduped = Array.from(new Set(models.filter(Boolean)));
  return deduped;
}

function friendlyModelError(message: string) {
  if (message === "Missing bearer token" || message === "Invalid token") {
    return "登录状态已失效，请返回登录后重试";
  }
  if (message === "Failed to fetch") {
    return "无法连接后端服务，请确认 API 服务已启动";
  }
  return message;
}

export function SetupPage({ navigate }: SetupPageProps) {
  const [provider, setProvider] = useState<Provider>("sub2api");
  const [baseUrl, setBaseUrl] = useState(providerDefaultBaseUrls.sub2api);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [secretSaved, setSecretSaved] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState("读取模型配置中...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedBaseUrl = baseUrl.trim().replace(/\/$/, "");
  const canSubmit = Boolean(trimmedBaseUrl && model && (apiKey.trim() || secretSaved));
  const selectedProviderLabel = providerLabels[provider];

  const modelCountText = useMemo(() => {
    if (loadingConfig) return "加载中";
    if (!modelOptions.length) return "未获取";
    return `${modelOptions.length} 个可用模型`;
  }, [loadingConfig, modelOptions.length]);

  const clearModelsForConfigChange = () => {
    setModel("");
    setModelOptions([]);
    setConnected(null);
    setStatusMessage("配置已变更，请点击“获取模型”刷新列表");
  };

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setLoadingConfig(true);
      setErrorMessage(null);
      try {
        const configResult = await getModelConfig();
        if (cancelled) return;

        const config = configResult.data;
        setProvider(config.provider);
        setBaseUrl(config.baseUrl);
        setModel(config.model);
        setSecretSaved(config.secretSaved);
        setModelOptions(config.model ? [config.model] : []);
        setConnected(config.secretSaved ? true : null);
        setStatusMessage(
          config.secretSaved
            ? "已读取保存的模型连接配置，可直接进入工作台；如需更新密钥请重新输入"
            : "请填写 Base URL 和 API Key 后点击“获取模型”"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取模型配置失败";
        if (!cancelled) {
          setConnected(false);
          setErrorMessage(friendlyModelError(message));
          setStatusMessage("模型配置读取失败");
        }
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    }

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProviderChange = (nextProvider: Provider) => {
    setProvider(nextProvider);
    setErrorMessage(null);
    if (!baseUrl.trim() || baseUrl === providerDefaultBaseUrls[provider]) {
      setBaseUrl(providerDefaultBaseUrls[nextProvider]);
    }
    clearModelsForConfigChange();
  };

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    setErrorMessage(null);
    clearModelsForConfigChange();
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setErrorMessage(null);
    clearModelsForConfigChange();
  };

  const handleFetchModels = async () => {
    setErrorMessage(null);
    setConnected(null);

    if (!trimmedBaseUrl) {
      setErrorMessage("请先填写 Base URL");
      return;
    }
    if (!apiKey.trim() && !secretSaved) {
      setErrorMessage("请先填写 API Key，或使用已保存的密钥");
      return;
    }

    setFetchingModels(true);
    setStatusMessage("正在从模型服务获取模型列表...");
    try {
      const result = await testModelConfig({
        provider,
        baseUrl: trimmedBaseUrl,
        apiKey: apiKey.trim() || undefined
      });
      setConnected(result.data.connected);

      if (result.data.connected) {
        const nextModels = normalizeModels(result.data.models);
        setModelOptions(nextModels);
        setModel("");
        setStatusMessage(
          nextModels.length
            ? `已获取 ${nextModels.length} 个模型，耗时 ${result.data.latencyMs}ms，请选择默认模型`
            : "连接正常，但模型服务没有返回可用模型"
        );
        if (!nextModels.length) {
          setErrorMessage("模型服务没有返回可用模型，请检查 Base URL 或 API Key 权限");
        }
      } else {
        setModel("");
        setModelOptions([]);
        setStatusMessage(result.data.message);
        setErrorMessage(result.data.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取模型列表失败";
      setConnected(false);
      setModel("");
      setModelOptions([]);
      setErrorMessage(friendlyModelError(message));
      setStatusMessage("获取模型列表失败");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async (nextRoute: "chat" | "login") => {
    setErrorMessage(null);
    if (!canSubmit) {
      setErrorMessage("请先获取模型列表并选择默认模型");
      return;
    }

    setSaving(true);
    try {
      await saveModelConfig({
        provider,
        baseUrl: trimmedBaseUrl,
        model,
        secretSaved,
        secretInput: apiKey.trim() || undefined
      });
      setSecretSaved(true);
      navigate(nextRoute);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存模型配置失败";
      setErrorMessage(friendlyModelError(message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-agent-bg text-agent-ink">
      <header className="sticky top-0 z-10 flex h-[64px] items-center justify-between border-b border-agent-divider bg-white px-8">
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

      <main className="mx-auto flex w-full max-w-[1040px] gap-7 px-8 py-12 pb-24">
        <section className="min-w-0 flex-1">
          <div className="mb-8">
            <div className="text-[28px] font-extrabold text-agent-ink">选择你的 AI 模型服务</div>
            <p className="mt-2 max-w-[580px] text-sm leading-6 text-agent-muted">
              AgentPro 会使用 OpenAI 兼容格式调用模型。这里先完成连接配置，后续可在设置页随时更换。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {providers.map((item) => {
              const Icon = item.icon;
              const active = item.provider === provider;
              return (
                <button
                  className={`relative min-h-[148px] rounded-[14px] border bg-white p-5 text-left shadow-agent-sm transition-all hover:-translate-y-0.5 hover:shadow-agent ${
                    active ? "border-2 border-agent-primary" : "border-agent-border"
                  }`}
                  key={item.provider}
                  type="button"
                  onClick={() => handleProviderChange(item.provider)}
                >
                  <div className="mb-5 flex items-center justify-between">
                    <div className={`grid h-10 w-10 place-items-center rounded-[10px] ${active ? "bg-agent-pale text-agent-primary" : "bg-[#F3F6FA] text-agent-muted"}`}>
                      <Icon size={19} />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-agent-primary text-white" : "bg-[#F0F4FA] text-agent-muted"}`}>
                      {item.tag}
                    </span>
                  </div>
                  <div className="text-[15px] font-bold text-agent-ink">{item.title}</div>
                  <div className="mt-2 text-xs leading-5 text-agent-muted">{item.desc}</div>
                </button>
              );
            })}
          </div>

          <AppCard className="mt-6 p-6">
            <div className="mb-5 flex items-center justify-between border-b border-agent-divider pb-5">
              <div>
                <div className="text-lg font-bold text-agent-ink">模型连接配置</div>
                <div className="mt-1 text-xs text-agent-muted">当前选择：{selectedProviderLabel}</div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  connected === false ? "bg-red-50 text-agent-danger" : "bg-[#E8FFF6] text-agent-success"
                }`}
              >
                {connected === false ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                {connected === false ? "连接异常" : connected ? "已获取模型列表" : "等待获取模型"}
              </span>
            </div>

            <div className="grid gap-5">
              <label className="flex flex-col gap-[7px]">
                <span className="agent-label">Base URL</span>
                <input className="agent-input px-4 py-[11px] text-sm" value={baseUrl} onChange={(event) => handleBaseUrlChange(event.target.value)} />
              </label>
              <label className="flex flex-col gap-[7px]">
                <span className="agent-label">API Key</span>
                <input
                  className="agent-input px-4 py-[11px] text-sm"
                  placeholder={secretSaved ? "已保存密钥；如需更新请重新输入" : "输入中转服务密钥，仅保存在后端安全配置"}
                  type="password"
                  value={apiKey}
                  onChange={(event) => handleApiKeyChange(event.target.value)}
                />
              </label>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <label className="flex flex-col gap-[7px]">
                  <span className="agent-label">默认模型</span>
                  <select className="agent-input px-4 py-[11px] text-sm" disabled={!modelOptions.length} value={model} onChange={(event) => setModel(event.target.value)}>
                    <option value="">{modelOptions.length ? "请选择默认模型" : "请先获取模型列表"}</option>
                    {modelOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <AppButton className="h-[43px] px-5" disabled={fetchingModels || loadingConfig} loading={fetchingModels} type="button" variant="secondary" onClick={handleFetchModels}>
                  {fetchingModels ? "获取中..." : "获取模型"}
                </AppButton>
              </div>
              <div className={`flex items-center justify-between rounded-[10px] border px-4 py-3 ${connected === false ? "border-red-100 bg-red-50" : "border-[#CBEEDB] bg-[#F0FFF7]"}`}>
                <div className={`flex items-center gap-2 text-sm font-semibold ${connected === false ? "text-agent-danger" : "text-agent-success"}`}>
                  <ListChecks size={18} />
                  {connected === false ? "模型列表获取失败" : connected ? "已获取模型列表" : "等待获取模型列表"}
                </div>
                <span className="text-xs text-agent-muted">{modelCountText}</span>
              </div>
              <div className="min-h-[18px] text-xs text-agent-muted">{statusMessage}</div>
              {errorMessage ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}
            </div>

            <div className="mt-7 flex justify-end gap-3">
              <AppButton disabled={saving} type="button" variant="ghost" onClick={() => navigate("login")}>
                稍后配置
              </AppButton>
              <AppButton className="inline-flex items-center gap-2" disabled={saving || !canSubmit} loading={saving} type="button" onClick={() => void handleSave("chat")}>
                {saving ? "保存中..." : "进入工作台"}
                {saving ? null : <ChevronRight size={16} />}
              </AppButton>
            </div>
          </AppCard>
        </section>

        <aside className="w-[280px] pt-[75px]">
          <div className="grid gap-4">
            {[
              ["什么是 Base URL", "模型服务的统一调用入口。sub2api 已提供兼容 OpenAI 的地址。"],
              ["API Key 存放在哪里", "正式版本会加密保存在后端，前端不会展示完整密钥。"],
              ["模型怎么选", "填写 Base URL 和 API Key 后点击“获取模型”，再从返回列表中选择默认模型。"]
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
