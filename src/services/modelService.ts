import { apiGet, apiPost } from "./apiClient";
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
  return apiPost("/model/config", config, { saved: true });
}

export function fetchModelList() {
  return apiGet("/model/list", ["claude-sonnet-4-20250514", "gpt-4o", "deepseek-chat"]);
}
