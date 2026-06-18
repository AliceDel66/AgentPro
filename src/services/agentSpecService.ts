import { requirementLibraryRows } from "../lib/mockData";
import { apiGet, apiPost, apiPostStream } from "./apiClient";
import type { AgentRequirement, AgentSpecDraft, RequirementActionResult, RequirementDetail } from "./types";

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

export function getRequirementDetail(requirementId: string) {
  return apiGet<RequirementDetail>(`/requirements/${requirementId}`, {
    id: requirementId,
    title: "需求访谈",
    status: "interviewing",
    maturity: 45,
    route: "chat",
    summary: "",
    messages: [],
    followupQuestions: [],
    decisions: [],
    safetyReview: {}
  });
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

function requirementDraftFallback(payload: Record<string, unknown>): RequirementDetail {
  return {
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
  };
}

export function streamRequirementDraft(payload: Record<string, unknown>, onToken: (token: string) => void) {
  return apiPostStream<Record<string, unknown>, RequirementDetail>(
    "/requirements/stream",
    payload,
    requirementDraftFallback(payload),
    { onToken }
  );
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

export function streamRequirementMessage(requirementId: string, content: string, onToken: (token: string) => void) {
  return apiPostStream(
    `/requirements/${requirementId}/messages/stream`,
    { content },
    {
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
    } satisfies RequirementDetail,
    { onToken }
  );
}

export function confirmRequirementFollowups(requirementId: string, decisions: Array<Record<string, unknown>>) {
  return apiPost<{ decisions: Array<Record<string, unknown>> }, RequirementDetail>(`/requirements/${requirementId}/followups/confirm`, { decisions }, {
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

export function generateAgentSpec(requirementId: string) {
  return apiPost<object, AgentSpecDraft>(`/requirements/${requirementId}/spec/generate`, {}, {
    id: "spec_mock_001",
    requirementId,
    version: 1,
    title: "AgentSpec 草案",
    status: "draft",
    body: {}
  });
}

export function getAgentSpec(requirementId: string) {
  return apiGet<AgentSpecDraft>(`/requirements/${requirementId}/spec`, {
    id: "spec_mock_001",
    requirementId,
    version: 1,
    title: "AgentSpec 草案",
    status: "draft",
    body: {}
  });
}

export function approveAgentSpec(requirementId: string) {
  return apiPost<object, RequirementActionResult>(`/requirements/${requirementId}/approve`, {}, {
    id: requirementId,
    status: "approved",
    spec: null
  });
}

export function archiveRequirement(requirementId: string) {
  return apiPost<object, RequirementActionResult>(`/requirements/${requirementId}/archive`, {}, {
    id: requirementId,
    status: "archived",
    spec: null
  });
}
