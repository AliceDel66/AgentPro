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

export function getReviewReport(jobId: string) {
  return apiGet(`/reviews/${jobId}`, mockReview);
}

export function acceptReviewRecommendation(reviewId: string) {
  return apiPost("/reviews/accept", { reviewId }, { accepted: true });
}
