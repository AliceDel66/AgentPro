import { apiGet, apiPost, apiPut } from "./apiClient";
import type { ModelProviderConfig } from "./types";

const mockModelConfig: ModelProviderConfig = {
  provider: "sub2api",
  baseUrl: "https://api.sub2api.com/v1",
  model: "claude-sonnet-4-20250514",
  secretSaved: true
};

export function getModelConfig() {
  return apiGet("/model/config", mockModelConfig);
}

export function saveModelConfig(config: ModelProviderConfig & { secretInput?: string }) {
  return apiPut("/model/config", config, mockModelConfig);
}

export function fetchModelList() {
  return apiGet("/model/list", ["claude-sonnet-4-20250514", "gpt-4o", "deepseek-chat"]);
}

export function testModelConfig(config: Partial<ModelProviderConfig> & { apiKey?: string }) {
  return apiPost("/model/test", config, {
    connected: true,
    latencyMs: 120,
    message: "mock fallback",
    models: [mockModelConfig.model]
  });
}
