from typing import Any, Literal

from pydantic import BaseModel, Field


class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    initialMessage: str | None = Field(default=None, max_length=8000)


class RequirementMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class RequirementUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=180)


class FollowupDecision(BaseModel):
    key: str
    value: Any
    confirmed: bool = True


class FollowupConfirmRequest(BaseModel):
    decisions: list[FollowupDecision]


class ConversationMessagePayload(BaseModel):
    id: str
    role: Literal["user", "assistant", "system"]
    content: str
    createdAt: str


class RequirementJobSummary(BaseModel):
    id: str
    status: str
    progress: int
    strategy: str
    updatedAt: str


class RequirementReviewSummary(BaseModel):
    id: str
    status: str
    score: int
    recommendedEngine: str | None = None
    createdAt: str


class RequirementListItem(BaseModel):
    id: str
    title: str
    status: str
    maturity: int
    route: str | None = None
    workflowStatus: str | None = None
    latestSpecId: str | None = None
    latestJob: RequirementJobSummary | None = None
    latestReview: RequirementReviewSummary | None = None


class RequirementDetail(BaseModel):
    id: str
    title: str
    status: str
    maturity: int
    summary: str | None
    messages: list[ConversationMessagePayload]
    followupQuestions: list[dict[str, Any]]
    decisions: list[dict[str, Any]]
    safetyReview: dict[str, Any]
    graphRunId: str | None = None


class AgentSpecPayload(BaseModel):
    id: str
    requirementId: str
    version: int
    title: str
    status: str
    body: dict[str, Any]


class RequirementActionResponse(BaseModel):
    id: str
    status: str
    spec: AgentSpecPayload | None = None


class RequirementDeleteResponse(BaseModel):
    id: str
    deleted: bool
