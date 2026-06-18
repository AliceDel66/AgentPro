import { apiGet, apiPost } from "./apiClient";
import type { ReviewReport } from "./types";

const mockReview: ReviewReport = {
  id: "review_mock_001",
  jobId: "job_mock_parallel_001",
  specId: "spec_mock_001",
  requirementId: "req_mock_001",
  requirementTitle: "示例 Agent",
  createdAt: new Date().toISOString(),
  recommendedEngine: "claude-code",
  score: 88,
  hallucinationRisk: 15,
  stabilityScore: 91,
  performanceScore: 85,
  status: "draft",
  summary: "Mock 评审报告"
};

export function getReviewReport(reviewId: string) {
  return apiGet(`/reviews/${reviewId}`, mockReview);
}

export function listReviewReports() {
  return apiGet<ReviewReport[]>("/reviews", [mockReview]);
}

export function getLatestReview(params: { jobId?: string; specId?: string }) {
  const query = new URLSearchParams();
  if (params.jobId) query.set("jobId", params.jobId);
  if (params.specId) query.set("specId", params.specId);
  return apiGet<ReviewReport | null>(`/reviews/latest?${query.toString()}`, null);
}

export function createReviewReport(payload: { jobId?: string; specId?: string }) {
  return apiPost("/reviews", payload, mockReview);
}

export function regenerateReviewReport(reviewId: string) {
  return apiPost<object, ReviewReport>(`/reviews/${reviewId}/regenerate`, {}, {
    ...mockReview,
    id: "review_mock_regenerated"
  });
}

export function optimizeFromReviewReport(reviewId: string) {
  return apiPost<object, ReviewReport>(`/reviews/${reviewId}/optimize`, {}, {
    ...mockReview,
    optimizationJob: {
      id: "job_mock_optimize",
      status: "running",
      progress: 1,
      engines: ["codex"],
      strategy: "codex",
      sourceReviewId: reviewId
    }
  });
}

export function acceptReviewRecommendation(reviewId: string) {
  return apiPost(`/reviews/${reviewId}/accept`, {}, { accepted: true });
}

export function requestReviewRework(reviewId: string) {
  return apiPost(`/reviews/${reviewId}/rework`, {}, { reworkRequested: true });
}

export function mergeReviewStrengths(reviewId: string) {
  return apiPost(`/reviews/${reviewId}/merge`, {}, { status: "merge_planned" });
}
