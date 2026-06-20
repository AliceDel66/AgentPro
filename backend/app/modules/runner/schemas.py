from typing import Any, Literal

from pydantic import BaseModel, Field

RunnerStrategy = Literal["codex", "claude-code", "parallel"]
RunnerJobStatus = Literal[
    "queued",
    "running",
    "completed",
    "completed_with_warnings",
    "failed",
    "blocked",
]


class DevJobCreate(BaseModel):
    specId: str | None = None
    requirementId: str | None = None
    strategy: RunnerStrategy


class DevJobPayload(BaseModel):
    id: str
    status: str
    progress: int
    engines: list[str]
    strategy: RunnerStrategy
    requirementId: str | None = None
    specId: str | None = None
    sourceReviewId: str | None = None


class DevJobRunnerPackage(BaseModel):
    id: str
    strategy: RunnerStrategy
    engines: list[str]
    prompt: str
    requirementId: str | None = None
    specId: str | None = None
    sourceReviewId: str | None = None


class DevJobLeaseRequest(BaseModel):
    runnerId: str = Field(min_length=1, max_length=120)
    leaseSeconds: int = Field(default=300, ge=30, le=1800)


class DevJobLeaseResponse(BaseModel):
    leased: bool
    leaseOwner: str | None
    leaseExpiresAt: str | None


class DevJobEventCreate(BaseModel):
    level: Literal["debug", "info", "warning", "error"] = "info"
    phase: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)
    progress: int | None = Field(default=None, ge=0, le=100)
    status: RunnerJobStatus | None = None


RunnerArtifactKind = Literal[
    "run-log",
    "diff-summary",
    "test-report",
    "security-scan",
    "secret-scan",
    "runner-unavailable",
    "delivery-manifest",
]


class DevJobArtifactCreate(BaseModel):
    engine: Literal["codex", "claude-code"]
    kind: RunnerArtifactKind
    summary: str | None = None
    uri: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class DevJobArtifactPayload(BaseModel):
    id: str
    engine: str
    kind: str
    summary: str | None
    uri: str | None
