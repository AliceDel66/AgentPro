from pydantic import BaseModel, Field


class DeliveredAgent(BaseModel):
    """A completed (accepted-review) Agent the user can use inside AgentPro."""

    requirementId: str
    title: str
    specId: str
    reviewId: str
    deliveryMode: str
    objective: str


class AgentRunRequest(BaseModel):
    """A single in-app run request for a delivered Agent."""

    input: str = Field(min_length=1, max_length=8000)
