import { apiGet } from "./apiClient";

export interface HealthPayload {
  status: "ok";
  service: string;
  version: string;
}

export function getBackendHealth() {
  return apiGet<HealthPayload>("/health", {
    status: "ok",
    service: "agentpro-api",
    version: "mock"
  });
}
