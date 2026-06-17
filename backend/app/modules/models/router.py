from time import perf_counter

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.responses import ok
from app.db.models import ModelProviderConfig, User
from app.db.session import get_db_session
from app.modules.auth.router import get_current_user
from app.modules.models.schemas import (
    ModelConfigResponse,
    ModelConfigUpdate,
    ModelTestRequest,
    ModelTestResponse,
)

router = APIRouter(prefix="/model")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)

DEFAULT_MODEL_CONFIG = ModelConfigResponse(
    provider="sub2api",
    baseUrl="https://api.sub2api.com/v1",
    model="claude-sonnet-4-20250514",
    secretSaved=False,
)


def serialize_config(config: ModelProviderConfig | None) -> ModelConfigResponse:
    if not config:
        return DEFAULT_MODEL_CONFIG
    return ModelConfigResponse(
        provider=config.provider,
        baseUrl=config.base_url,
        model=config.default_model,
        secretSaved=config.secret_saved,
    )


async def get_user_config(
    session: AsyncSession,
    user_id: str,
    provider: str | None = None,
) -> ModelProviderConfig | None:
    statement = select(ModelProviderConfig).where(ModelProviderConfig.user_id == user_id)
    if provider:
        statement = statement.where(ModelProviderConfig.provider == provider)
    result = await session.execute(statement.order_by(ModelProviderConfig.updated_at.desc()))
    return result.scalars().first()


async def fetch_openai_model_names(base_url: str, api_key: str | None) -> list[str]:
    if "example" in base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        return []

    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    url = f"{base_url.rstrip('/')}/models"
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        payload = response.json()

    data = payload.get("data", []) if isinstance(payload, dict) else []
    return [item["id"] for item in data if isinstance(item, dict) and item.get("id")]


@router.get("/config")
async def get_model_config(
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    return ok(serialize_config(await get_user_config(session, current_user.id)))


@router.put("/config")
async def update_model_config(
    body: ModelConfigUpdate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    config = await get_user_config(session, current_user.id, body.provider)
    secret = body.apiKey or body.secretInput
    if not config:
        config = ModelProviderConfig(
            user_id=current_user.id,
            provider=body.provider,
            base_url=str(body.baseUrl).rstrip("/"),
            default_model=body.model,
            api_key_ciphertext=encrypt_secret(secret) if secret else None,
            secret_saved=bool(secret),
        )
        session.add(config)
    else:
        config.base_url = str(body.baseUrl).rstrip("/")
        config.default_model = body.model
        if secret:
            config.api_key_ciphertext = encrypt_secret(secret)
            config.secret_saved = True

    await session.commit()
    return ok(serialize_config(config))


@router.post("/test")
async def test_model_config(
    body: ModelTestRequest,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    stored = await get_user_config(session, current_user.id, body.provider)
    base_url = str(body.baseUrl).rstrip("/") if body.baseUrl else stored.base_url if stored else ""
    api_key = body.apiKey or decrypt_secret(stored.api_key_ciphertext if stored else None)
    model = body.model or (stored.default_model if stored else DEFAULT_MODEL_CONFIG.model)

    started = perf_counter()
    try:
        models = await fetch_openai_model_names(base_url, api_key)
        latency_ms = int((perf_counter() - started) * 1000)
        return ok(
            ModelTestResponse(
                connected=True,
                latencyMs=latency_ms,
                message="模型服务连接正常",
                models=models or [model],
            )
        )
    except Exception as exc:
        latency_ms = int((perf_counter() - started) * 1000)
        return ok(
            ModelTestResponse(
                connected=False,
                latencyMs=latency_ms,
                message=f"模型服务连接失败：{exc.__class__.__name__}",
                models=[model],
            )
        )


@router.get("/list")
async def list_models(
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    stored = await get_user_config(session, current_user.id)
    if not stored:
        return ok([DEFAULT_MODEL_CONFIG.model, "gpt-4o", "deepseek-chat"])

    api_key = decrypt_secret(stored.api_key_ciphertext)
    try:
        models = await fetch_openai_model_names(stored.base_url, api_key)
    except Exception:
        models = []
    return ok(models or [stored.default_model])
