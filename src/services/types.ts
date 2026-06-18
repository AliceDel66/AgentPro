import type { AppRoute } from "../types";

export interface ApiResult<T> {
  ok: boolean;
  data: T;
  message?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  tokenType: "bearer";
  expiresIn: number;
}

export interface EmailCodeResult {
  sent: boolean;
  cooldownSeconds: number;
  debugCode?: string;
}

export interface ModelProviderConfig {
  provider: "sub2api" | "openai-compatible" | "custom";
  baseUrl: string;
  model: string;
  secretSaved: boolean;
}

export interface ModelTestResult {
  connected: boolean;
  latencyMs: number;
  message: string;
  models: string[];
}

export interface AgentRequirement {
  id: string;
  title: string;
  status: string;
  maturity: number;
  route?: AppRoute;
}

export interface RequirementDetail extends AgentRequirement {
  summary?: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
  }>;
  followupQuestions: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  safetyReview: Record<string, unknown>;
  graphRunId?: string;
}

export interface AgentSpecDraft {
  id: string;
  requirementId: string;
  version: number;
  title: string;
  status: string;
  body: Record<string, unknown>;
}

export interface RequirementActionResult {
  id: string;
  status: string;
  spec?: AgentSpecDraft | null;
}

export interface RequirementDeleteResult {
  id: string;
  deleted: boolean;
}

export interface RunnerRequest {
  specId?: string;
  requirementId?: string;
  strategy: "codex" | "claude-code" | "parallel";
}

export interface RunnerJob {
  id: string;
  status: string;
  progress: number;
  engines: string[];
  strategy?: "codex" | "claude-code" | "parallel";
  requirementId?: string | null;
  specId?: string | null;
  sourceReviewId?: string | null;
}

export interface RunnerEvent {
  id: string;
  level: "debug" | "info" | "warning" | "error";
  phase: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewReport {
  id: string;
  jobId?: string | null;
  specId?: string | null;
  requirementId?: string | null;
  requirementTitle?: string | null;
  createdAt?: string;
  recommendedEngine: "codex" | "claude-code";
  score: number;
  hallucinationRisk: number;
  stabilityScore: number;
  performanceScore: number;
  status?: string;
  summary?: string;
  findings?: Array<Record<string, unknown>>;
  optimizationJob?: RunnerJob | null;
}
