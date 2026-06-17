from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.responses import ApiResult, ok

router = APIRouter()


class HealthPayload(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


@router.get("/health", response_model=ApiResult[HealthPayload])
async def health_check() -> ApiResult[HealthPayload]:
    return ok(HealthPayload(status="ok", service="agentpro-api", version="0.1.0"))
