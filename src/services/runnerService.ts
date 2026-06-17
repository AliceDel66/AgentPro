import { apiGet, apiPost } from "./apiClient";
import type { RunnerJob, RunnerRequest } from "./types";

const mockJob: RunnerJob = {
  id: "job_mock_parallel_001",
  status: "running",
  progress: 72,
  engines: ["codex", "claude-code"]
};

export function startRunnerJob(request: RunnerRequest) {
  return apiPost("/runner/jobs", request, mockJob);
}

export function getRunnerJob(jobId: string) {
  return apiGet(`/runner/jobs/${jobId}`, mockJob);
}
