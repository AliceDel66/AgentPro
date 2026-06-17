import { requirementLibraryRows } from "../lib/mockData";
import { apiGet, apiPost } from "./apiClient";
import type { AgentRequirement, RequirementDetail } from "./types";

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
  return apiPost<Record<string, unknown>, RequirementDetail>("/requirements", payload, {
    id: "req_mock_001",
    title: String(payload.title ?? "未命名需求"),
    status: "interviewing",
    maturity: 45,
    route: "chat",
    summary: String(payload.initialMessage ?? ""),
    messages: [],
    followupQuestions: [],
    decisions: [],
    safetyReview: {},
    graphRunId: "graph_mock_001"
  });
}

export function sendRequirementMessage(requirementId: string, content: string) {
  return apiPost(`/requirements/${requirementId}/messages`, { content }, {
    id: requirementId,
    title: "需求访谈",
    status: "interviewing",
    maturity: 55,
    route: "chat",
    summary: content,
    messages: [],
    followupQuestions: [],
    decisions: [],
    safetyReview: {}
  } satisfies RequirementDetail);
}

export function confirmRequirementFollowups(requirementId: string, decisions: Array<Record<string, unknown>>) {
  return apiPost(`/requirements/${requirementId}/followups/confirm`, { decisions }, {
    id: requirementId,
    title: "需求访谈",
    status: "ready_for_spec",
    maturity: 80,
    route: "followup",
    summary: "",
    messages: [],
    followupQuestions: [],
    decisions,
    safetyReview: {}
  } satisfies RequirementDetail);
}

export function approveAgentSpec(specId: string) {
  return apiPost("/agent-spec/approve", { specId }, { approved: true });
}
