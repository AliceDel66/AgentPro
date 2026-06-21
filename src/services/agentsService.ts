import { apiGet, apiPostStream } from "./apiClient";
import type { DeliveredAgent } from "./types";

export function getDeliveredAgents() {
  return apiGet<DeliveredAgent[]>("/agents", []);
}

export interface AgentRunResult {
  output: string;
  model: string;
}

export function runAgentStream(requirementId: string, input: string, onToken: (token: string) => void) {
  return apiPostStream<{ input: string }, AgentRunResult>(
    `/agents/${requirementId}/run`,
    { input },
    { output: "", model: "" },
    { onToken }
  );
}
