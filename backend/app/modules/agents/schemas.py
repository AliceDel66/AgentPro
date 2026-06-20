from pydantic import BaseModel


class DeliveredAgent(BaseModel):
    """A completed (accepted-review) Agent the user can use inside AgentPro."""

    requirementId: str
    title: str
    specId: str
    reviewId: str
    deliveryMode: str
    objective: str
