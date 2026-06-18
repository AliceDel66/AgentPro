import { apiGet, apiPost } from "./apiClient";
import type { ReviewReport } from "./types";

const mockReview: ReviewReport = {
  id: "review_mock_001",
  recommendedEngine: "claude-code",
  score: 88,
  hallucinationRisk: 15,
  stabilityScore: 91,
  performanceScore: 85
};

export function getReviewReport(reviewId: string) {
  return apiGet(`/reviews/${reviewId}`, mockReview);
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

export function acceptReviewRecommendation(reviewId: string) {
  return apiPost(`/reviews/${reviewId}/accept`, {}, { accepted: true });
}

export function requestReviewRework(reviewId: string) {
  return apiPost(`/reviews/${reviewId}/rework`, {}, { reworkRequested: true });
}

export function mergeReviewStrengths(reviewId: string) {
  return apiPost(`/reviews/${reviewId}/merge`, {}, { status: "merge_planned" });
}
