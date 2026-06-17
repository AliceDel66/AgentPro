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

export interface RunnerRequest {
  specId: string;
  strategy: "codex" | "claude-code" | "parallel";
}

export interface RunnerJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  engines: string[];
}

export interface ReviewReport {
  id: string;
  recommendedEngine: "codex" | "claude-code";
  score: number;
  hallucinationRisk: number;
  stabilityScore: number;
  performanceScore: number;
}
