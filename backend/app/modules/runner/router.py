import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.responses import ok
from app.db.models import AgentSpec, DevJob, DevJobArtifact, DevJobEvent, Requirement, User
from app.db.session import async_session_factory, get_db_session
from app.modules.auth.router import get_current_user
from app.modules.runner.executor import (
    execute_dev_job,
    load_requirement_for_job,
    load_source_review_for_job,
    load_spec_for_job,
    prompt_for_job,
    runner_engines,
)
from app.modules.runner.schemas import (
    DevJobArtifactCreate,
    DevJobArtifactPayload,
    DevJobCreate,
    DevJobEventCreate,
    DevJobLeaseRequest,
    DevJobLeaseResponse,
    DevJobPayload,
    DevJobRunnerPackage,
)

router = APIRouter(prefix="/dev-jobs")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)
TERMINAL_JOB_STATUSES = {"completed", "completed_with_warnings", "failed", "blocked"}
# Allowed job-status transitions when a client (desktop runner) reports via the events API.
# A job must pass through `running` before any terminal state, and terminal states are locked,
# so a user cannot forge completion (e.g. queued -> completed) on their own job.
JOB_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"running", "blocked", "failed"},
    "running": {"running", "completed", "completed_with_warnings", "failed", "blocked"},
}
DESKTOP_RUNNER_ID_PREFIX = "agentpro-desktop"
DESKTOP_RUNNER_STALE_TIMEOUT = timedelta(seconds=90)


def session_factory_for_request(request: Request):
    return getattr(request.app.state, "db_session_factory", async_session_factory)


def engines_for_strategy(strategy: str) -> list[str]:
    return runner_engines(strategy)


def serialize_job(job: DevJob) -> DevJobPayload:
    return DevJobPayload(
        id=job.id,
        status=job.status,
        progress=job.progress,
        engines=engines_for_strategy(job.strategy),
        strategy=job.strategy,
        requirementId=job.requirement_id,
        specId=job.spec_id,
        sourceReviewId=job.source_review_id,
    )


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def latest_event_for_job(session: AsyncSession, job_id: str) -> DevJobEvent | None:
    result = await session.execute(
        select(DevJobEvent)
        .where(DevJobEvent.job_id == job_id)
        .order_by(DevJobEvent.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def mark_stale_desktop_job_if_needed(session: AsyncSession, job: DevJob) -> DevJob:
    if job.status in TERMINAL_JOB_STATUSES:
        return job
    if not job.lease_owner or not job.lease_owner.startswith(DESKTOP_RUNNER_ID_PREFIX):
        return job

    latest_event = await latest_event_for_job(session, job.id)
    last_seen_at = ensure_utc(
        latest_event.created_at if latest_event else job.updated_at or job.created_at
    )
    if last_seen_at and datetime.now(UTC) - last_seen_at <= DESKTOP_RUNNER_STALE_TIMEOUT:
        return job

    job.status = "blocked"
    session.add(
        DevJobEvent(
            job_id=job.id,
            level="error",
            phase="desktop.runner.stale",
            message="本地 Runner 心跳超时，桌面端执行器可能已退出或无响应。",
            payload={
                "status": "blocked",
                "progress": job.progress,
                "lastSeenAt": last_seen_at.isoformat() if last_seen_at else None,
            },
        )
    )
    await session.commit()
    await session.refresh(job)
    return job


async def get_owned_job(job_id: str, session: AsyncSession, user: User) -> DevJob:
    job = await session.get(DevJob, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dev job not found")
    return job


def assert_valid_job_status_transition(current: str, target: str) -> None:
    """Reject illegal job-status changes coming from the events API.

    Same-status updates are no-ops; otherwise the target must be reachable from the
    current state. Terminal states have no outgoing transitions, so a finished job
    cannot be reopened or re-faked.
    """
    if target == current:
        return
    if target not in JOB_STATUS_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"非法的任务状态流转：{current} -> {target}",
        )


async def resolve_owned_targets(
    session: AsyncSession,
    user: User,
    requirement_id: str | None,
    spec_id: str | None,
) -> tuple[Requirement | None, AgentSpec | None]:
    """Validate that any referenced requirement/spec exists and belongs to the user.

    A spec is owned transitively via its requirement. Cross-user or missing targets
    are rejected so a DevJob can never reference another user's requirement content.
    """
    requirement: Requirement | None = None
    spec: AgentSpec | None = None

    if requirement_id:
        requirement = await session.get(Requirement, requirement_id)
        if not requirement or requirement.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found"
            )

    if spec_id:
        spec = await session.get(AgentSpec, spec_id)
        if not spec:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="AgentSpec not found"
            )
        spec_requirement = (
            requirement
            if requirement and requirement.id == spec.requirement_id
            else await session.get(Requirement, spec.requirement_id)
        )
        if not spec_requirement or spec_requirement.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="AgentSpec not found"
            )
        if requirement and spec.requirement_id != requirement.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="specId 与 requirementId 不匹配",
            )
        requirement = requirement or spec_requirement

    if not requirement and not spec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="requirementId 或 specId 至少需要一个",
        )
    return requirement, spec


@router.post("")
async def create_dev_job(
    body: DevJobCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    await resolve_owned_targets(session, current_user, body.requirementId, body.specId)
    job = DevJob(
        user_id=current_user.id,
        requirement_id=body.requirementId,
        spec_id=body.specId,
        source_review_id=None,
        strategy=body.strategy,
        status="queued",
        progress=0,
    )
    session.add(job)
    await session.flush()
    await record_audit(
        session,
        user_id=current_user.id,
        action="dev_job.create",
        resource_type="dev_job",
        resource_id=job.id,
        payload={
            "strategy": job.strategy,
            "specId": job.spec_id,
            "requirementId": job.requirement_id,
        },
    )
    await session.commit()
    return ok(serialize_job(job))


@router.get("/{job_id}")
async def get_dev_job(
    job_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    job = await mark_stale_desktop_job_if_needed(session, job)
    return ok(serialize_job(job))


@router.get("/{job_id}/runner-package")
async def get_dev_job_runner_package(
    job_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    """Build the prompt package for a desktop-local runner.

    The API server owns task state and audit data; the desktop app owns actual CLI
    execution so production deployments do not run Codex/Claude Code on the server.
    """
    job = await get_owned_job(job_id, session, current_user)
    requirement = await load_requirement_for_job(session, job)
    spec = await load_spec_for_job(session, job)
    source_review, source_findings = await load_source_review_for_job(session, job)
    return ok(
        DevJobRunnerPackage(
            id=job.id,
            strategy=job.strategy,
            engines=engines_for_strategy(job.strategy),
            prompt=prompt_for_job(job, requirement, spec, source_review, source_findings),
            requirementId=job.requirement_id,
            specId=job.spec_id,
            sourceReviewId=job.source_review_id,
        )
    )


@router.post("/{job_id}/execute")
async def execute_dev_job_endpoint(
    job_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    if job.status not in {"queued", "failed", "blocked", "running"}:
        return ok(serialize_job(job))
    executed_job = await execute_dev_job(session, job)
    return ok(serialize_job(executed_job))


async def execute_dev_job_background(job_id: str, session_factory: Callable):
    async with session_factory() as session:
        job = await session.get(DevJob, job_id)
        if not job:
            return
        if job.status in TERMINAL_JOB_STATUSES:
            return
        await execute_dev_job(session, job)


@router.post("/{job_id}/execute/async")
async def execute_dev_job_async_endpoint(
    job_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    if job.status in TERMINAL_JOB_STATUSES:
        return ok(serialize_job(job))
    if job.status != "running":
        session.add(
            DevJobEvent(
                job_id=job.id,
                level="info",
                phase="execution.enqueue",
                message="真实 Runner 已进入后台执行队列。",
                payload={},
            )
        )
        job.status = "running"
        job.progress = max(job.progress, 1)
        await session.commit()
        await session.refresh(job)
        background_tasks.add_task(
            execute_dev_job_background,
            job.id,
            session_factory_for_request(request),
        )
    return ok(serialize_job(job))


@router.post("/{job_id}/lease")
async def lease_dev_job(
    job_id: str,
    body: DevJobLeaseRequest,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    now = datetime.now(UTC)
    if job.lease_owner and job.lease_expires_at and job.lease_expires_at > now:
        return ok(
            DevJobLeaseResponse(
                leased=False,
                leaseOwner=job.lease_owner,
                leaseExpiresAt=job.lease_expires_at.isoformat(),
            )
        )

    job.lease_owner = body.runnerId
    job.lease_expires_at = now + timedelta(seconds=body.leaseSeconds)
    job.status = "running"
    await session.commit()
    return ok(
        DevJobLeaseResponse(
            leased=True,
            leaseOwner=job.lease_owner,
            leaseExpiresAt=job.lease_expires_at.isoformat(),
        )
    )


@router.post("/{job_id}/events")
async def append_dev_job_event(
    job_id: str,
    body: DevJobEventCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    if body.status:
        assert_valid_job_status_transition(job.status, body.status)
    payload = dict(body.payload)
    if body.progress is not None:
        payload["progress"] = body.progress
    if body.status:
        payload["status"] = body.status
    event = DevJobEvent(
        job_id=job.id,
        level=body.level,
        phase=body.phase,
        message=body.message,
        payload=payload,
    )
    session.add(event)
    if body.progress is not None:
        job.progress = body.progress
    if body.status:
        job.status = body.status
    await session.commit()
    return ok(serialize_job(job))


@router.post("/{job_id}/artifacts")
async def append_dev_job_artifact(
    job_id: str,
    body: DevJobArtifactCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    artifact = DevJobArtifact(
        job_id=job.id,
        engine=body.engine,
        kind=body.kind,
        summary=body.summary,
        uri=body.uri,
        payload=body.payload,
    )
    session.add(artifact)
    await session.commit()
    return ok(
        DevJobArtifactPayload(
            id=artifact.id,
            engine=artifact.engine,
            kind=artifact.kind,
            summary=artifact.summary,
            uri=artifact.uri,
        )
    )


@router.get("/{job_id}/events")
async def list_dev_job_events(
    job_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    await mark_stale_desktop_job_if_needed(session, job)
    result = await session.execute(
        select(DevJobEvent)
        .where(DevJobEvent.job_id == job.id)
        .order_by(DevJobEvent.created_at.asc())
    )
    return ok(
        [
            {
                "id": event.id,
                "level": event.level,
                "phase": event.phase,
                "message": event.message,
                "payload": event.payload,
                "progress": event.payload.get("progress"),
                "status": event.payload.get("status"),
                "createdAt": event.created_at.isoformat(),
            }
            for event in result.scalars().all()
        ]
    )


@router.get("/{job_id}/stream")
async def stream_dev_job(
    job_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await get_owned_job(job_id, session, current_user)
    job = await mark_stale_desktop_job_if_needed(session, job)
    result = await session.execute(
        select(DevJobEvent)
        .where(DevJobEvent.job_id == job.id)
        .order_by(DevJobEvent.created_at.asc())
    )
    events = list(result.scalars().all())

    async def event_stream():
        snapshot = serialize_job(job).model_dump()
        yield f"event: snapshot\ndata: {json.dumps(snapshot, ensure_ascii=False)}\n\n"
        for event in events:
            payload = {
                "id": event.id,
                "level": event.level,
                "phase": event.phase,
                "message": event.message,
                "payload": event.payload,
                "progress": event.payload.get("progress"),
                "status": event.payload.get("status"),
                "createdAt": event.created_at.isoformat(),
            }
            yield f"event: log\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        yield 'event: heartbeat\ndata: {"ok": true}\n\n'

    return StreamingResponse(event_stream(), media_type="text/event-stream")
