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


class ReviewScoreBreakdownPayload(BaseModel):
    key: str
    label: str
    score: int
    reason: str
    evidenceCount: int


class ReviewEvidenceSourcePayload(BaseModel):
    id: str
    type: str
    engine: str | None = None
    summary: str
    artifactId: str | None = None
    eventId: str | None = None
    uri: str | None = None
    payload: dict[str, Any] | None = None
    createdAt: str


class ReviewActionPlanItemPayload(BaseModel):
    id: str
    priority: Literal["high", "medium", "low"]
    title: str
    reason: str
    recommendedChange: str
    validationMethod: str
    sourceFindingIds: list[str]
    reworkRecommended: bool


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
    scoreBreakdown: list[ReviewScoreBreakdownPayload]
    evidenceSources: list[ReviewEvidenceSourcePayload]
    actionPlan: list[ReviewActionPlanItemPayload]
    deliveryAdvice: str
    optimizationJob: DevJobPayload | None = None


class ReviewActionResponse(BaseModel):
    id: str
    status: str
