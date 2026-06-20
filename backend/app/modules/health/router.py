from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.responses import ApiResult, ok
from app.core.version import (
    API_CAPABILITIES,
    API_CONTRACT_VERSION,
    APP_VERSION,
    MIN_DESKTOP_CONTRACT_VERSION,
)

router = APIRouter()


class HealthPayload(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    contractVersion: int
    minDesktopContractVersion: int
    capabilities: list[str]


@router.get("/health", response_model=ApiResult[HealthPayload])
async def health_check() -> ApiResult[HealthPayload]:
    return ok(
        HealthPayload(
            status="ok",
            service="agentpro-api",
            version=APP_VERSION,
            contractVersion=API_CONTRACT_VERSION,
            minDesktopContractVersion=MIN_DESKTOP_CONTRACT_VERSION,
            capabilities=API_CAPABILITIES,
        )
    )
