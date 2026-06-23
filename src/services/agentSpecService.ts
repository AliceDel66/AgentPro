import { requirementLibraryRows } from "../lib/mockData";
import { apiDelete, apiGet, apiPost, apiPostStream, apiPut } from "./apiClient";
import type { AgentRequirement, AgentSpecDraft, RequirementActionResult, RequirementDeleteResult, RequirementDetail } from "./types";

const mockRequirements: AgentRequirement[] = requirementLibraryRows.map((row, index) => ({
  id: `req_mock_${index + 1}`,
  title: row.title,
  status: row.status,
  maturity: Number.parseInt(row.maturity, 10) || 0,
  route: row.route
}));

const CONFIRM_RECONCILE_DELAYS_MS = [0, 1_200, 2_500];

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function decisionKey(decision: Record<string, unknown>) {
  return String(decision.key ?? "").trim();
}

function isConfirmedDecision(decision: Record<string, unknown>) {
  return decision.confirmed === true;
}

export function hasConfirmedFollowupDecisions(detail: RequirementDetail, decisions: Array<Record<string, unknown>>) {
  const submittedKeys = decisions.map(decisionKey).filter(Boolean);
  if (!submittedKeys.length) return false;
  if (!detail.followupQuestions.length) return true;

  const confirmedKeys = new Set(
    detail.decisions
      .filter(isConfirmedDecision)
      .map(decisionKey)
      .filter(Boolean)
  );
  return submittedKeys.every((key) => confirmedKeys.has(key));
}

export async function reconcileRequirementFollowupConfirmation(requirementId: string, decisions: Array<Record<string, unknown>>) {
  let latestDetail: RequirementDetail | null = null;
  let lastError: Error | null = null;

  for (const delayMs of CONFIRM_RECONCILE_DELAYS_MS) {
    if (delayMs) await wait(delayMs);
    try {
      const result = await getRequirementDetail(requirementId);
      latestDetail = result.data;
      if (hasConfirmedFollowupDecisions(latestDetail, decisions)) {
        return { accepted: true, detail: latestDetail, error: null };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("读取服务端确认状态失败");
    }
  }

  return { accepted: false, detail: latestDetail, error: lastError };
}

export function listRequirements(options: { includeTrash?: boolean } = {}) {
  const query = options.includeTrash ? "?includeTrash=true" : "";
  return apiGet(`/requirements${query}`, mockRequirements);
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

export function renameRequirement(requirementId: string, title: string) {
  return apiPut<{ title: string }, RequirementDetail>(`/requirements/${requirementId}`, { title }, {
    id: requirementId,
    title,
    status: "interviewing",
    maturity: 0,
    route: "chat",
    summary: "",
    messages: [],
    followupQuestions: [],
    decisions: [],
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

export function trashRequirement(requirementId: string) {
  return apiPost<object, RequirementActionResult>(`/requirements/${requirementId}/trash`, {}, {
    id: requirementId,
    status: "trashed",
    spec: null
  });
}

export function restoreRequirement(requirementId: string) {
  return apiPost<object, RequirementActionResult>(`/requirements/${requirementId}/restore`, {}, {
    id: requirementId,
    status: "archived",
    spec: null
  });
}

export function deleteRequirement(requirementId: string) {
  return apiDelete<RequirementDeleteResult>(`/requirements/${requirementId}`, {
    id: requirementId,
    deleted: true
  });
}
