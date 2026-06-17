import { requirementLibraryRows } from "../lib/mockData";
import { apiGet, apiPost } from "./apiClient";
import type { AgentRequirement } from "./types";

const mockRequirements: AgentRequirement[] = requirementLibraryRows.map((row, index) => ({
  id: `req_mock_${index + 1}`,
  title: row.title,
  status: row.status,
  maturity: Number.parseInt(row.maturity, 10) || 0,
  route: row.route
}));

export function listRequirements() {
  return apiGet("/requirements", mockRequirements);
}

export function saveRequirementDraft(payload: Record<string, unknown>) {
  return apiPost("/requirements/draft", payload, { id: "req_mock_001", saved: true });
}

export function approveAgentSpec(specId: string) {
  return apiPost("/agent-spec/approve", { specId }, { approved: true });
}
