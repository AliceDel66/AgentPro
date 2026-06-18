from typing import Any, Literal

from pydantic import BaseModel

from app.modules.runner.schemas import DevJobPayload


class ReviewCreate(BaseModel):
    jobId: str | None = None
    specId: str | None = None


class ReviewFindingPayload(BaseModel):
    id: str
    severity: str
    category: str
    title: str
    detail: str
    evidence: dict[str, Any]


class ReviewReportPayload(BaseModel):
    id: str
    status: str
    jobId: str | None = None
    specId: str | None = None
    requirementId: str | None = None
    requirementTitle: str | None = None
    createdAt: str
    recommendedEngine: Literal["codex", "claude-code"]
    score: int
    hallucinationRisk: int
    stabilityScore: int
    performanceScore: int
    summary: str | None
    findings: list[ReviewFindingPayload]
    optimizationJob: DevJobPayload | None = None


class ReviewActionResponse(BaseModel):
    id: str
    status: str
