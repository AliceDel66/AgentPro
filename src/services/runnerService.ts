import { apiGet, apiPost } from "./apiClient";
import type { RunnerEvent, RunnerJob, RunnerPackage, RunnerRequest } from "./types";

const mockJob: RunnerJob = {
  id: "job_mock_parallel_001",
  status: "running",
  progress: 72,
  engines: ["codex", "claude-code"]
};

export function startRunnerJob(request: RunnerRequest) {
  return apiPost("/dev-jobs", request, mockJob);
}

export function executeRunnerJob(jobId: string) {
  return apiPost(`/dev-jobs/${jobId}/execute`, {}, mockJob);
}

export function executeRunnerJobAsync(jobId: string) {
  return apiPost(`/dev-jobs/${jobId}/execute/async`, {}, mockJob);
}

export function getRunnerPackage(jobId: string) {
  return apiGet<RunnerPackage>(`/dev-jobs/${jobId}/runner-package`, {
    id: jobId,
    strategy: "codex",
    engines: ["codex"],
    prompt: "",
    requirementId: null,
    specId: null,
    sourceReviewId: null
  });
}

export function getRunnerJob(jobId: string) {
  return apiGet(`/dev-jobs/${jobId}`, mockJob);
}

export function getRunnerEvents(jobId: string) {
  return apiGet<RunnerEvent[]>(`/dev-jobs/${jobId}/events`, []);
}

export function leaseRunnerJob(jobId: string, runnerId: string) {
  return apiPost(`/dev-jobs/${jobId}/lease`, { runnerId }, { leased: true });
}

export function appendRunnerEvent(
  jobId: string,
  event: { phase: string; message: string; level?: string; progress?: number; status?: string; payload?: Record<string, unknown> }
) {
  return apiPost(`/dev-jobs/${jobId}/events`, event, mockJob);
}

export function appendRunnerArtifact(
  jobId: string,
  artifact: { engine: "codex" | "claude-code"; kind: string; summary?: string; uri?: string; payload?: Record<string, unknown> }
) {
  return apiPost(`/dev-jobs/${jobId}/artifacts`, artifact, { id: "artifact_mock_001" });
}

export function getRunnerJobStreamPath(jobId: string) {
  return `/dev-jobs/${jobId}/stream`;
}
