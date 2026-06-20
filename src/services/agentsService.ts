import { apiGet } from "./apiClient";
import type { DeliveredAgent } from "./types";

export function getDeliveredAgents() {
  return apiGet<DeliveredAgent[]>("/agents", []);
}
