from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, Field

ModelProvider = Literal["sub2api", "openai-compatible", "custom"]


class ModelConfigResponse(BaseModel):
    provider: ModelProvider
    baseUrl: str
    model: str
    secretSaved: bool


class ModelConfigUpdate(BaseModel):
    provider: ModelProvider = "sub2api"
    baseUrl: AnyHttpUrl
    model: str = Field(min_length=1)
    apiKey: str | None = None
    secretInput: str | None = None


class ModelTestRequest(BaseModel):
    provider: ModelProvider = "sub2api"
    baseUrl: AnyHttpUrl | None = None
    model: str | None = None
    apiKey: str | None = None


class ModelTestResponse(BaseModel):
    connected: bool
    latencyMs: int
    message: str
    models: list[str]
