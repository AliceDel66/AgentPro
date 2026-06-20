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
  summary: "Mock 评审报告",
  scoreBreakdown: [
    { key: "functionality", label: "功能完成度", score: 88, reason: "已生成候选产物并包含基础执行记录。", evidenceCount: 2 },
    { key: "requirement_match", label: "需求一致性", score: 84, reason: "AgentSpec 与候选产物基本一致。", evidenceCount: 1 },
    { key: "stability", label: "稳定性", score: 91, reason: "未发现阻塞错误。", evidenceCount: 3 },
    { key: "performance", label: "性能", score: 85, reason: "执行耗时处于可接受范围。", evidenceCount: 1 },
    { key: "hallucination", label: "幻觉风险", score: 85, reason: "高风险动作较少。", evidenceCount: 1 },
    { key: "security", label: "安全风险", score: 94, reason: "未发现明显敏感信息。", evidenceCount: 0 },
    { key: "test_coverage", label: "测试覆盖", score: 82, reason: "识别到测试通过信号。", evidenceCount: 1 }
  ],
  evidenceSources: [
    {
      id: "artifact:mock-run-log",
      type: "run-log",
      engine: "claude-code",
      summary: "本机 Runner 执行完成，测试通过。",
      artifactId: "mock-run-log",
      createdAt: new Date().toISOString()
    },
    {
      id: "artifact:mock-delivery",
      type: "delivery-manifest",
      engine: "claude-code",
      summary: "本次产物是 AgentPro 源码补丁，而不是独立安装包。",
      artifactId: "mock-delivery",
      uri: "/Users/demo/AgentPro/runs/job_mock_parallel_001/claude-code/agentpro-delivery.json",
      payload: {
        version: 1,
        jobId: "job_mock_parallel_001",
        engine: "claude-code",
        workspacePath: "/Users/demo/AgentPro/runs/job_mock_parallel_001/claude-code",
        deliverableType: "agentpro_patch",
        summary: "本次产物是 AgentPro 源码补丁，而不是独立安装包。",
        entrypoints: [
          { label: "Runner 工作区", kind: "workspace", path: "/Users/demo/AgentPro/runs/job_mock_parallel_001/claude-code" },
          { label: "构建产物", kind: "build", path: "/Users/demo/AgentPro/runs/job_mock_parallel_001/claude-code/dist/index.html" },
          { label: "运行说明", kind: "readme", path: "/Users/demo/AgentPro/runs/job_mock_parallel_001/claude-code/README.md" }
        ],
        changedFiles: ["src/pages/workspace/AgentsPage.tsx"],
        untrackedFiles: ["src/pages/workspace/AgentRunPage.tsx"],
        previewCommand: "npm run preview -- --host 127.0.0.1",
        buildArtifactMissing: false,
        createdAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    }
  ],
  actionPlan: [
    {
      id: "plan-mock-1",
      priority: "medium",
      title: "补充边界场景测试",
      reason: "当前候选产物仍缺少异常输入覆盖。",
      recommendedChange: "补充失败路径、空输入和权限边界的自动化测试。",
      validationMethod: "重新运行测试并重新生成评审报告。",
      sourceFindingIds: [],
      reworkRecommended: true
    }
  ],
  deliveryAdvice: "当前产物适合作为候选版本保留，建议完成中优先级优化后再交付。"
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
