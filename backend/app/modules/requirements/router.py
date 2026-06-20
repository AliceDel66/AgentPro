import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.responses import ok
from app.db.models import (
    AgentGraphRun,
    AgentSpec,
    ConversationMessage,
    DevJob,
    Requirement,
    RequirementDecision,
    ReviewReport,
    User,
)
from app.db.session import get_db_session
from app.modules.auth.router import get_current_user
from app.modules.requirements.ai_service import (
    run_ai_requirement_graph,
    stream_ai_requirement_message,
)
from app.modules.requirements.graph import (
    RequirementGraphState,
    filter_confirmed_followups,
    run_requirement_graph,
)
from app.modules.requirements.schemas import (
    AgentSpecPayload,
    ConversationMessagePayload,
    FollowupConfirmRequest,
    RequirementActionResponse,
    RequirementCreate,
    RequirementDeleteResponse,
    RequirementDetail,
    RequirementJobSummary,
    RequirementListItem,
    RequirementMessageCreate,
    RequirementReviewSummary,
)

router = APIRouter(prefix="/requirements")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)
logger = logging.getLogger(__name__)


def serialize_message(message: ConversationMessage) -> ConversationMessagePayload:
    return ConversationMessagePayload(
        id=message.id,
        role=message.role,
        content=message.content,
        createdAt=message.created_at.isoformat(),
    )


async def get_owned_requirement(
    requirement_id: str,
    session: AsyncSession,
    user: User,
) -> Requirement:
    requirement = await session.get(Requirement, requirement_id)
    if not requirement or requirement.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")
    return requirement


async def load_messages(session: AsyncSession, requirement_id: str) -> list[ConversationMessage]:
    result = await session.execute(
        select(ConversationMessage)
        .where(ConversationMessage.requirement_id == requirement_id)
        .order_by(ConversationMessage.created_at.asc())
    )
    return list(result.scalars().all())


async def load_decisions(session: AsyncSession, requirement_id: str) -> list[dict[str, Any]]:
    result = await session.execute(
        select(RequirementDecision).where(RequirementDecision.requirement_id == requirement_id)
    )
    return [
        {
            "key": decision.decision_key,
            "value": decision.decision_value,
            "confirmed": decision.confirmed_by_user,
        }
        for decision in result.scalars().all()
    ]


def format_decision_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def followup_confirmation_message(decisions: list[dict[str, Any]]) -> str:
    lines = ["已确认反问："]
    for item in decisions:
        lines.append(f"- {item['key']}：{format_decision_value(item.get('value'))}")
    return "\n".join(lines)


async def persist_graph_run(
    session: AsyncSession,
    requirement: Requirement,
    graph_state: RequirementGraphState,
    graph_name: str = "RequirementGraph",
) -> AgentGraphRun:
    maturity = min(95, max(10, 100 - len(graph_state.get("gaps", [])) * 12))
    requirement.summary = graph_state.get("summary")
    requirement.maturity = maturity
    requirement.status = "interviewing" if graph_state.get("gaps") else "ready_for_spec"

    graph_run = AgentGraphRun(
        requirement_id=requirement.id,
        graph_name=graph_name,
        status="waiting_user_confirmation",
        current_node="approval_wait",
        state_snapshot=dict(graph_state),
    )
    session.add(graph_run)
    await session.flush()
    return graph_run


def assistant_followup_text(graph_state: RequirementGraphState) -> str:
    assistant_message = graph_state.get("assistantMessage")
    if isinstance(assistant_message, str) and assistant_message.strip():
        return assistant_message.strip()

    questions = graph_state.get("followupQuestions", [])
    if not questions:
        return "需求关键信息已经比较完整，可以生成 AgentSpec 草案。"
    lines = ["我整理了几个需要你确认的问题："]
    lines.extend(f"{index}. {item['question']}" for index, item in enumerate(questions, start=1))
    return "\n".join(lines)


def sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def stream_text_chunks(text: str, chunk_size: int = 3) -> AsyncIterator[str]:
    content = text.strip()
    for index in range(0, len(content), chunk_size):
        yield content[index : index + chunk_size]
        await asyncio.sleep(0)


def serialize_spec(spec: AgentSpec) -> AgentSpecPayload:
    return AgentSpecPayload(
        id=spec.id,
        requirementId=spec.requirement_id,
        version=spec.version,
        title=spec.title,
        status=spec.status,
        body=spec.body,
    )


async def latest_graph_state(
    session: AsyncSession,
    requirement: Requirement,
) -> RequirementGraphState:
    result = await session.execute(
        select(AgentGraphRun)
        .where(AgentGraphRun.requirement_id == requirement.id)
        .order_by(AgentGraphRun.updated_at.desc())
    )
    graph_run = result.scalars().first()
    if graph_run:
        return graph_run.state_snapshot

    messages = await load_messages(session, requirement.id)
    return run_requirement_graph(
        [{"role": message.role, "content": message.content} for message in messages]
    )


async def process_requirement_graph(
    session: AsyncSession,
    requirement: Requirement,
    user: User,
    confirmed_decisions: list[dict[str, Any]] | None = None,
) -> tuple[RequirementGraphState, str]:
    messages = [
        {"role": message.role, "content": message.content}
        for message in await load_messages(session, requirement.id)
    ]
    decisions = confirmed_decisions or []
    try:
        ai_state = await run_ai_requirement_graph(
            session,
            user.id,
            requirement.title,
            messages,
            confirmed_decisions=decisions,
        )
        if ai_state:
            return ai_state, "AIRequirementGraph"
    except Exception as exc:
        logger.warning(
            "Requirement AI graph failed, falling back to rules: %s",
            exc.__class__.__name__,
        )

    return (
        run_requirement_graph(messages, confirmed_decisions=decisions),
        "RequirementGraph",
    )


async def latest_spec(session: AsyncSession, requirement_id: str) -> AgentSpec | None:
    result = await session.execute(
        select(AgentSpec)
        .where(AgentSpec.requirement_id == requirement_id)
        .order_by(AgentSpec.version.desc(), AgentSpec.updated_at.desc())
    )
    return result.scalars().first()


async def latest_job_for_requirement(
    session: AsyncSession,
    user_id: str,
    requirement: Requirement,
    spec: AgentSpec | None,
) -> DevJob | None:
    filters = [DevJob.user_id == user_id, DevJob.requirement_id == requirement.id]
    if spec:
        filters.append(DevJob.spec_id == spec.id)
    result = await session.execute(
        select(DevJob)
        .where(or_(*filters))
        .order_by(DevJob.updated_at.desc(), DevJob.created_at.desc())
    )
    return result.scalars().first()


async def latest_review_for_requirement(
    session: AsyncSession,
    user_id: str,
    requirement: Requirement,
    spec: AgentSpec | None,
    job: DevJob | None,
) -> ReviewReport | None:
    filters = [ReviewReport.user_id == user_id]
    context_filters = []
    if job:
        context_filters.append(ReviewReport.job_id == job.id)
    if spec:
        context_filters.append(ReviewReport.spec_id == spec.id)
    if not context_filters:
        return None

    result = await session.execute(
        select(ReviewReport)
        .where(*filters, or_(*context_filters))
        .order_by(ReviewReport.created_at.desc())
    )
    return result.scalars().first()


def workflow_status_for_requirement(
    requirement: Requirement,
    job: DevJob | None,
    review: ReviewReport | None,
) -> str:
    if review:
        return "reviewed"
    if job:
        if job.status in {"completed", "completed_with_warnings"}:
            return "developed"
        if job.status in {"failed", "blocked"}:
            return "dev_blocked"
        if job.status in {"queued", "running"}:
            return "developing"
    return requirement.status


async def build_list_item(
    session: AsyncSession,
    requirement: Requirement,
    current_user: User,
) -> RequirementListItem:
    spec = await latest_spec(session, requirement.id)
    job = await latest_job_for_requirement(session, current_user.id, requirement, spec)
    review = await latest_review_for_requirement(session, current_user.id, requirement, spec, job)
    return RequirementListItem(
        id=requirement.id,
        title=requirement.title,
        status=requirement.status,
        maturity=requirement.maturity,
        route="library" if requirement.status == "trashed" else requirement.route or "chat",
        workflowStatus=workflow_status_for_requirement(requirement, job, review),
        latestSpecId=spec.id if spec else None,
        latestJob=(
            RequirementJobSummary(
                id=job.id,
                status=job.status,
                progress=job.progress,
                strategy=job.strategy,
                updatedAt=job.updated_at.isoformat(),
            )
            if job
            else None
        ),
        latestReview=(
            RequirementReviewSummary(
                id=review.id,
                status=review.status,
                score=review.score,
                recommendedEngine=review.recommended_engine,
                createdAt=review.created_at.isoformat(),
            )
            if review
            else None
        ),
    )


async def create_spec_from_requirement(
    session: AsyncSession,
    requirement: Requirement,
) -> AgentSpec:
    graph_state = await latest_graph_state(session, requirement)
    current = await latest_spec(session, requirement.id)
    spec = AgentSpec(
        requirement_id=requirement.id,
        version=(current.version + 1) if current else 1,
        title=f"{requirement.title} AgentSpec",
        status="draft",
        body={
            **graph_state.get("specDraft", {}),
            "requirementId": requirement.id,
            "safetyReview": graph_state.get("safetyReview", {}),
            "approvalChecklist": [
                "目标用户和使用场景已确认",
                "工具权限和高风险动作已确认",
                "失败兜底和人工介入路径已确认",
                "评审指标和验收标准已确认",
            ],
        },
    )
    requirement.status = "spec_draft"
    session.add(spec)
    await session.flush()
    return spec


async def build_detail(
    session: AsyncSession,
    requirement: Requirement,
    graph_state: RequirementGraphState | None = None,
    graph_run_id: str | None = None,
) -> RequirementDetail:
    messages = await load_messages(session, requirement.id)
    decisions = (
        graph_state.get("decisions", [])
        if graph_state
        else await load_decisions(session, requirement.id)
    )
    followups = graph_state.get("followupQuestions", []) if graph_state else []
    followups = filter_confirmed_followups(followups, decisions)
    return RequirementDetail(
        id=requirement.id,
        title=requirement.title,
        status=requirement.status,
        maturity=requirement.maturity,
        summary=requirement.summary,
        messages=[serialize_message(message) for message in messages],
        followupQuestions=followups,
        decisions=decisions,
        safetyReview=graph_state.get("safetyReview", {}) if graph_state else {},
        graphRunId=graph_run_id,
    )


async def stream_requirement_answer(
    session: AsyncSession,
    requirement: Requirement,
    current_user: User,
    confirmed_decisions: list[dict[str, Any]] | None = None,
) -> AsyncIterator[str]:
    decisions = confirmed_decisions or await load_decisions(session, requirement.id)
    messages = [
        {"role": message.role, "content": message.content}
        for message in await load_messages(session, requirement.id)
    ]
    assistant_parts: list[str] = []
    stream_error: Exception | None = None

    try:
        async for token in stream_ai_requirement_message(
            session,
            current_user.id,
            requirement.title,
            messages,
            confirmed_decisions=decisions,
        ):
            assistant_parts.append(token)
            yield sse_event("token", {"content": token})
    except Exception as exc:
        stream_error = exc
        logger.warning(
            "Requirement AI stream failed, falling back to rules: %s",
            exc.__class__.__name__,
        )

    assistant_text = "".join(assistant_parts).strip()
    if assistant_text:
        # Derive the structured state (followups / specDraft / safety) from real AI too —
        # not the rules template — so the questions reflect the user's actual scenario and
        # AgentSpec is AI-authored. Fall back to rules only when the AI call is unavailable.
        graph_state = None
        if not stream_error:
            try:
                graph_state = await run_ai_requirement_graph(
                    session,
                    current_user.id,
                    requirement.title,
                    messages,
                    confirmed_decisions=decisions,
                )
            except Exception as exc:
                logger.warning(
                    "Requirement AI structured graph failed after stream: %s",
                    exc.__class__.__name__,
                )
        if graph_state is None:
            graph_state = run_requirement_graph(messages, confirmed_decisions=decisions)
        graph_state["assistantMessage"] = assistant_text
        graph_state["model"] = "stream"
        graph_state["aiResponseFormat"] = "stream_text"
        graph_name = "AIStreamRequirementGraph"
        if stream_error:
            suffix = (
                "\n\n模型流式响应中断，我已保留已收到的内容。"
                "你可以继续补充需求，系统会重新整理。"
            )
            graph_state["assistantMessage"] = f"{assistant_text}{suffix}"
            graph_state["aiStreamInterrupted"] = True
            async for token in stream_text_chunks(suffix):
                yield sse_event("token", {"content": token})
            assistant_text = graph_state["assistantMessage"]
    else:
        graph_state = run_requirement_graph(messages, confirmed_decisions=decisions)
        graph_name = "RequirementGraph"
        assistant_text = assistant_followup_text(graph_state)
        async for token in stream_text_chunks(assistant_text):
            yield sse_event("token", {"content": token})

    session.add(
        ConversationMessage(
            requirement_id=requirement.id,
            role="assistant",
            content=assistant_text,
            message_metadata={"graph": graph_name, "streamed": True},
        )
    )
    graph_run = await persist_graph_run(session, requirement, graph_state, graph_name)
    await session.commit()
    detail = await build_detail(session, requirement, graph_state, graph_run.id)
    yield sse_event("detail", detail.model_dump(mode="json"))


@router.post("")
async def create_requirement(
    body: RequirementCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = Requirement(user_id=current_user.id, title=body.title, status="interviewing")
    session.add(requirement)
    await session.flush()

    if body.initialMessage:
        session.add(
            ConversationMessage(
                requirement_id=requirement.id,
                role="user",
                content=body.initialMessage,
            )
        )
        await session.flush()

    graph_state, graph_name = await process_requirement_graph(session, requirement, current_user)
    session.add(
        ConversationMessage(
            requirement_id=requirement.id,
            role="assistant",
            content=assistant_followup_text(graph_state),
            message_metadata={"graph": graph_name},
        )
    )
    graph_run = await persist_graph_run(session, requirement, graph_state, graph_name)
    await session.commit()
    return ok(await build_detail(session, requirement, graph_state, graph_run.id))


@router.post("/stream")
async def create_requirement_stream(
    body: RequirementCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = Requirement(user_id=current_user.id, title=body.title, status="interviewing")
    session.add(requirement)
    await session.flush()

    if body.initialMessage:
        session.add(
            ConversationMessage(
                requirement_id=requirement.id,
                role="user",
                content=body.initialMessage,
            )
        )
        await session.flush()

    return StreamingResponse(
        stream_requirement_answer(session, requirement, current_user),
        media_type="text/event-stream",
    )


@router.get("")
async def list_requirements(
    include_trash: bool = Query(False, alias="includeTrash"),
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    filters = [Requirement.user_id == current_user.id]
    if not include_trash:
        filters.append(Requirement.status != "trashed")

    result = await session.execute(
        select(Requirement)
        .where(*filters)
        .order_by(Requirement.updated_at.desc())
    )
    return ok(
        [
            await build_list_item(session, requirement, current_user)
            for requirement in result.scalars().all()
        ]
    )


@router.get("/{requirement_id}")
async def get_requirement(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    graph_state = await latest_graph_state(session, requirement)
    return ok(await build_detail(session, requirement, graph_state))


@router.post("/{requirement_id}/messages")
async def add_requirement_message(
    requirement_id: str,
    body: RequirementMessageCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    session.add(
        ConversationMessage(requirement_id=requirement.id, role="user", content=body.content)
    )
    await session.flush()
    graph_state, graph_name = await process_requirement_graph(session, requirement, current_user)
    session.add(
        ConversationMessage(
            requirement_id=requirement.id,
            role="assistant",
            content=assistant_followup_text(graph_state),
            message_metadata={"graph": graph_name},
        )
    )
    graph_run = await persist_graph_run(session, requirement, graph_state, graph_name)
    await session.commit()
    return ok(await build_detail(session, requirement, graph_state, graph_run.id))


@router.post("/{requirement_id}/messages/stream")
async def add_requirement_message_stream(
    requirement_id: str,
    body: RequirementMessageCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    session.add(
        ConversationMessage(requirement_id=requirement.id, role="user", content=body.content)
    )
    await session.flush()
    return StreamingResponse(
        stream_requirement_answer(session, requirement, current_user),
        media_type="text/event-stream",
    )


@router.post("/{requirement_id}/followups/confirm")
async def confirm_followups(
    requirement_id: str,
    body: FollowupConfirmRequest,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    submitted_decisions: list[dict[str, Any]] = []
    for item in body.decisions:
        submitted_decisions.append(
            {"key": item.key, "value": item.value, "confirmed": item.confirmed}
        )
        result = await session.execute(
            select(RequirementDecision).where(
                RequirementDecision.requirement_id == requirement.id,
                RequirementDecision.decision_key == item.key,
            )
        )
        decision = result.scalar_one_or_none()
        if decision:
            decision.decision_value = {"value": item.value}
            decision.confirmed_by_user = item.confirmed
        else:
            session.add(
                RequirementDecision(
                    requirement_id=requirement.id,
                    decision_key=item.key,
                    decision_value={"value": item.value},
                    confirmed_by_user=item.confirmed,
                )
            )

    if submitted_decisions:
        session.add(
            ConversationMessage(
                requirement_id=requirement.id,
                role="user",
                content=followup_confirmation_message(submitted_decisions),
                message_metadata={"kind": "followup_confirmation"},
            )
        )

    await session.flush()
    confirmed_decisions = await load_decisions(session, requirement.id)
    graph_state, graph_name = await process_requirement_graph(
        session,
        requirement,
        current_user,
        confirmed_decisions=confirmed_decisions,
    )
    session.add(
        ConversationMessage(
            requirement_id=requirement.id,
            role="assistant",
            content=assistant_followup_text(graph_state),
            message_metadata={"graph": graph_name},
        )
    )
    graph_run = await persist_graph_run(session, requirement, graph_state, graph_name)
    await session.commit()
    return ok(await build_detail(session, requirement, graph_state, graph_run.id))


@router.post("/{requirement_id}/spec/generate")
async def generate_spec(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    spec = await create_spec_from_requirement(session, requirement)
    await session.commit()
    return ok(serialize_spec(spec))


@router.get("/{requirement_id}/spec")
async def get_spec(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    spec = await latest_spec(session, requirement.id)
    if not spec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AgentSpec not found")
    return ok(serialize_spec(spec))


@router.post("/{requirement_id}/approve")
async def approve_requirement(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    spec = await latest_spec(session, requirement.id)
    if not spec:
        spec = await create_spec_from_requirement(session, requirement)
    spec.status = "approved"
    requirement.status = "approved"
    await record_audit(
        session,
        user_id=current_user.id,
        action="requirement.approve",
        resource_type="requirement",
        resource_id=requirement.id,
        payload={"specId": spec.id},
    )
    await session.commit()
    return ok(
        RequirementActionResponse(
            id=requirement.id,
            status=requirement.status,
            spec=serialize_spec(spec),
        )
    )


@router.post("/{requirement_id}/archive")
async def archive_requirement(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    requirement.status = "archived"
    await session.commit()
    return ok(RequirementActionResponse(id=requirement.id, status=requirement.status))


@router.post("/{requirement_id}/trash")
async def trash_requirement(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    previous_status = requirement.status
    requirement.status = "trashed"
    await record_audit(
        session,
        user_id=current_user.id,
        action="requirement.trash",
        resource_type="requirement",
        resource_id=requirement.id,
        payload={"previousStatus": previous_status},
    )
    await session.commit()
    return ok(RequirementActionResponse(id=requirement.id, status=requirement.status))


@router.post("/{requirement_id}/restore")
async def restore_requirement(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    if requirement.status != "trashed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requirement is not in trash",
        )
    requirement.status = "archived"
    await record_audit(
        session,
        user_id=current_user.id,
        action="requirement.restore",
        resource_type="requirement",
        resource_id=requirement.id,
        payload={"restoredStatus": requirement.status},
    )
    await session.commit()
    return ok(RequirementActionResponse(id=requirement.id, status=requirement.status))


@router.delete("/{requirement_id}")
async def delete_requirement(
    requirement_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    if requirement.status != "trashed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Move requirement to trash before deleting permanently",
        )
    await record_audit(
        session,
        user_id=current_user.id,
        action="requirement.delete",
        resource_type="requirement",
        resource_id=requirement.id,
        payload={"title": requirement.title},
    )
    await session.delete(requirement)
    await session.commit()
    return ok(RequirementDeleteResponse(id=requirement_id, deleted=True))
