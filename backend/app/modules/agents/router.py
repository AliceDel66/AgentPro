from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.responses import ok
from app.db.models import AgentSpec, DevJob, Requirement, ReviewReport, User
from app.db.session import get_db_session
from app.modules.agents.schemas import DeliveredAgent
from app.modules.auth.router import get_current_user

router = APIRouter(prefix="/agents")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)


async def resolve_spec_for_review(session: AsyncSession, review: ReviewReport) -> AgentSpec | None:
    if review.spec_id:
        return await session.get(AgentSpec, review.spec_id)
    if review.job_id:
        job = await session.get(DevJob, review.job_id)
        if job and job.spec_id:
            return await session.get(AgentSpec, job.spec_id)
    return None


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
