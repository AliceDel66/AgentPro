import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret
from app.core.responses import ok
from app.db.models import AgentSpec, DevJob, Requirement, ReviewReport, User
from app.db.session import get_db_session
from app.modules.agents.schemas import AgentRunRequest, DeliveredAgent
from app.modules.auth.router import get_current_user
from app.modules.requirements.ai_service import (
    call_openai_chat_completion_stream,
    load_latest_model_config,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)


def sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def resolve_spec_for_review(session: AsyncSession, review: ReviewReport) -> AgentSpec | None:
    if review.spec_id:
        return await session.get(AgentSpec, review.spec_id)
    if review.job_id:
        job = await session.get(DevJob, review.job_id)
        if job and job.spec_id:
            return await session.get(AgentSpec, job.spec_id)
    return None


async def latest_spec_for_requirement(
    session: AsyncSession, requirement_id: str
) -> AgentSpec | None:
    result = await session.execute(
        select(AgentSpec)
        .where(AgentSpec.requirement_id == requirement_id)
        .order_by(AgentSpec.version.desc())
    )
    return result.scalars().first()


async def requirement_is_delivered(
    session: AsyncSession, user_id: str, requirement_id: str
) -> bool:
    """A requirement is delivered once any of its reviews has been accepted."""
    result = await session.execute(
        select(ReviewReport).where(
            ReviewReport.user_id == user_id, ReviewReport.status == "accepted"
        )
    )
    for review in result.scalars().all():
        spec = await resolve_spec_for_review(session, review)
        if spec and spec.requirement_id == requirement_id:
            return True
    return False


def build_agent_system_prompt(spec: AgentSpec) -> str:
    """Turn an accepted AgentSpec into the system prompt that drives in-app runs."""
    body = spec.body or {}
    lines: list[str] = [
        f"你是一个名为「{spec.title}」的 AI Agent，运行在 AgentPro 软件内，"
        "服务的是不懂技术的业务用户。",
        "请严格按照下面的 AgentSpec 履行职责：聚焦目标场景、复用既定能力、遵守已确认的边界，"
        "遇到能力范围外的请求要直接说明并给出可行的下一步，不要编造不存在的数据或操作结果。",
    ]
    objective = str(body.get("objective") or "").strip()
    if objective:
        lines.append(f"业务目标：{objective}")
    capabilities = [
        str(item).strip() for item in body.get("capabilities") or [] if str(item).strip()
    ]
    if capabilities:
        lines.append("核心能力：" + "；".join(capabilities))
    decisions = body.get("decisions") or []
    constraints: list[str] = []
    for decision in decisions:
        if not isinstance(decision, dict):
            continue
        question = str(decision.get("question") or decision.get("title") or "").strip()
        answer = str(decision.get("answer") or decision.get("selected") or "").strip()
        if question and answer:
            constraints.append(f"{question} → {answer}")
        elif answer:
            constraints.append(answer)
    if constraints:
        lines.append("已确认约束：" + "；".join(constraints))
    delivery = body.get("deliveryTarget") or {}
    mode = str(delivery.get("mode") or "").strip()
    if mode:
        lines.append(f"交付形态：{mode}（软件内运行时直接使用用户已配置的模型服务）。")
    lines.append("请用简洁、可执行的中文回复用户。")
    return "\n".join(lines)


async def stream_agent_run(
    base_url: str,
    api_key: str | None,
    model: str,
    system_prompt: str,
    user_input: str,
) -> AsyncIterator[str]:
    collected: list[str] = []
    try:
        async for token in call_openai_chat_completion_stream(
            base_url,
            api_key,
            model,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
        ):
            collected.append(token)
            yield sse_event("token", {"content": token})
    except Exception:  # noqa: BLE001 - surface a clean SSE error, log the cause
        logger.exception("Agent in-app run failed")
        yield sse_event("error", {"message": "运行 Agent 失败，请稍后重试或检查模型配置。"})
        return
    yield sse_event("detail", {"output": "".join(collected), "model": model})


@router.get("")
async def list_delivered_agents(
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    """List the user's delivered Agents (requirements whose review was accepted).

    These are the completed Agents the user can open and use inside AgentPro.
    """
    result = await session.execute(
        select(ReviewReport)
        .where(ReviewReport.user_id == current_user.id, ReviewReport.status == "accepted")
        .order_by(ReviewReport.created_at.desc())
    )
    agents: dict[str, DeliveredAgent] = {}
    for review in result.scalars().all():
        spec = await resolve_spec_for_review(session, review)
        if not spec:
            continue
        requirement = await session.get(Requirement, spec.requirement_id)
        if (
            not requirement
            or requirement.user_id != current_user.id
            or requirement.status == "trashed"
            or requirement.id in agents  # keep the most recent accepted review per requirement
        ):
            continue
        body = spec.body or {}
        delivery = body.get("deliveryTarget") or {}
        agents[requirement.id] = DeliveredAgent(
            requirementId=requirement.id,
            title=requirement.title,
            specId=spec.id,
            reviewId=review.id,
            deliveryMode=str(delivery.get("mode") or "undecided"),
            objective=str(body.get("objective") or ""),
        )
    return ok(list(agents.values()))


@router.post("/{requirement_id}/run")
async def run_agent(
    requirement_id: str,
    payload: AgentRunRequest,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    """Run a delivered Agent in-app, streaming tokens via SSE.

    The Agent is driven by its accepted AgentSpec and the user's own configured
    model service — no extra configuration, matching the in_app delivery mode.
    """
    requirement = await session.get(Requirement, requirement_id)
    if (
        not requirement
        or requirement.user_id != current_user.id
        or requirement.status == "trashed"
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent 不存在")
    if not await requirement_is_delivered(session, current_user.id, requirement_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="该 Agent 尚未采纳交付，暂不可运行"
        )
    spec = await latest_spec_for_requirement(session, requirement_id)
    if not spec:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="缺少 AgentSpec，无法运行该 Agent"
        )
    config = await load_latest_model_config(session, current_user.id)
    if not config or not config.base_url or not config.default_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="尚未配置 AI 模型服务，请先到设置页完成模型配置",
        )

    system_prompt = build_agent_system_prompt(spec)
    api_key = decrypt_secret(config.api_key_ciphertext)
    return StreamingResponse(
        stream_agent_run(
            config.base_url,
            api_key,
            config.default_model,
            system_prompt,
            payload.input.strip(),
        ),
        media_type="text/event-stream",
    )
