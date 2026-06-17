import { apiGet, apiPost } from "./apiClient";
import type { RunnerJob, RunnerRequest } from "./types";

const mockJob: RunnerJob = {
  id: "job_mock_parallel_001",
  status: "running",
  progress: 72,
  engines: ["codex", "claude-code"]
};

export function startRunnerJob(request: RunnerRequest) {
  return apiPost("/dev-jobs", request, mockJob);
}

export function getRunnerJob(jobId: string) {
  return apiGet(`/dev-jobs/${jobId}`, mockJob);
}

export function leaseRunnerJob(jobId: string, runnerId: string) {
  return apiPost(`/dev-jobs/${jobId}/lease`, { runnerId }, { leased: true });
}

export function appendRunnerEvent(
  jobId: string,
  event: { phase: string; message: string; level?: string; progress?: number; status?: string }
) {
  return apiPost(`/dev-jobs/${jobId}/events`, event, mockJob);
}

export function appendRunnerArtifact(
  jobId: string,
  artifact: { engine: "codex" | "claude-code"; kind: string; summary?: string; uri?: string; payload?: Record<string, unknown> }
) {
  return apiPost(`/dev-jobs/${jobId}/artifacts`, artifact, { id: "artifact_mock_001" });
}
