from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.responses import ok
from app.db.models import (
    AgentGraphRun,
    AgentSpec,
    ConversationMessage,
    Requirement,
    RequirementDecision,
    User,
)
from app.db.session import get_db_session
from app.modules.auth.router import get_current_user
from app.modules.requirements.graph import RequirementGraphState, run_requirement_graph
from app.modules.requirements.schemas import (
    AgentSpecPayload,
    ConversationMessagePayload,
    FollowupConfirmRequest,
    RequirementActionResponse,
    RequirementCreate,
    RequirementDetail,
    RequirementListItem,
    RequirementMessageCreate,
)

router = APIRouter(prefix="/requirements")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)


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


async def persist_graph_run(
    session: AsyncSession,
    requirement: Requirement,
    graph_state: RequirementGraphState,
) -> AgentGraphRun:
    maturity = min(95, max(10, 100 - len(graph_state.get("gaps", [])) * 12))
    requirement.summary = graph_state.get("summary")
    requirement.maturity = maturity
    requirement.status = "interviewing" if graph_state.get("gaps") else "ready_for_spec"

    graph_run = AgentGraphRun(
        requirement_id=requirement.id,
        graph_name="RequirementGraph",
        status="waiting_user_confirmation",
        current_node="approval_wait",
        state_snapshot=dict(graph_state),
    )
    session.add(graph_run)
    await session.flush()
    return graph_run


def assistant_followup_text(graph_state: RequirementGraphState) -> str:
    questions = graph_state.get("followupQuestions", [])
    if not questions:
        return "需求关键信息已经比较完整，可以生成 AgentSpec 草案。"
    lines = ["我整理了几个需要你确认的问题："]
    lines.extend(f"{index}. {item['question']}" for index, item in enumerate(questions, start=1))
    return "\n".join(lines)


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


async def latest_spec(session: AsyncSession, requirement_id: str) -> AgentSpec | None:
    result = await session.execute(
        select(AgentSpec)
        .where(AgentSpec.requirement_id == requirement_id)
        .order_by(AgentSpec.version.desc(), AgentSpec.updated_at.desc())
    )
    return result.scalars().first()


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
    return RequirementDetail(
        id=requirement.id,
        title=requirement.title,
        status=requirement.status,
        maturity=requirement.maturity,
        summary=requirement.summary,
        messages=[serialize_message(message) for message in messages],
        followupQuestions=graph_state.get("followupQuestions", []) if graph_state else [],
        decisions=decisions,
        safetyReview=graph_state.get("safetyReview", {}) if graph_state else {},
        graphRunId=graph_run_id,
    )


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

    messages = await load_messages(session, requirement.id)
    graph_state = run_requirement_graph(
        [{"role": message.role, "content": message.content} for message in messages]
    )
    session.add(
        ConversationMessage(
            requirement_id=requirement.id,
            role="assistant",
            content=assistant_followup_text(graph_state),
            message_metadata={"graph": "RequirementGraph"},
        )
    )
    graph_run = await persist_graph_run(session, requirement, graph_state)
    await session.commit()
    return ok(await build_detail(session, requirement, graph_state, graph_run.id))


@router.get("")
async def list_requirements(
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    result = await session.execute(
        select(Requirement)
        .where(Requirement.user_id == current_user.id)
        .order_by(Requirement.updated_at.desc())
    )
    return ok(
        [
            RequirementListItem(
                id=requirement.id,
                title=requirement.title,
                status=requirement.status,
                maturity=requirement.maturity,
                route="chat",
            )
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
    return ok(await build_detail(session, requirement))


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
    messages = await load_messages(session, requirement.id)
    graph_state = run_requirement_graph(
        [{"role": message.role, "content": message.content} for message in messages]
    )
    session.add(
        ConversationMessage(
            requirement_id=requirement.id,
            role="assistant",
            content=assistant_followup_text(graph_state),
            message_metadata={"graph": "RequirementGraph"},
        )
    )
    graph_run = await persist_graph_run(session, requirement, graph_state)
    await session.commit()
    return ok(await build_detail(session, requirement, graph_state, graph_run.id))


@router.post("/{requirement_id}/followups/confirm")
async def confirm_followups(
    requirement_id: str,
    body: FollowupConfirmRequest,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    requirement = await get_owned_requirement(requirement_id, session, current_user)
    for item in body.decisions:
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

    await session.flush()
    messages = await load_messages(session, requirement.id)
    confirmed_decisions = await load_decisions(session, requirement.id)
    graph_state = run_requirement_graph(
        [{"role": message.role, "content": message.content} for message in messages],
        confirmed_decisions=confirmed_decisions,
    )
    graph_run = await persist_graph_run(session, requirement, graph_state)
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
