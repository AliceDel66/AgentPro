from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.responses import ok
from app.db.models import (
    AgentSpec,
    DevJob,
    DevJobArtifact,
    DevJobEvent,
    Requirement,
    ReviewFinding,
    ReviewReport,
    User,
)
from app.db.session import get_db_session
from app.modules.auth.router import get_current_user
from app.modules.review.analyzer import analyze_review
from app.modules.review.schemas import (
    ReviewActionResponse,
    ReviewCreate,
    ReviewFindingPayload,
    ReviewReportPayload,
)
from app.modules.runner.executor import runner_engines
from app.modules.runner.schemas import DevJobPayload

router = APIRouter(prefix="/reviews")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)


def serialize_job(job: DevJob) -> DevJobPayload:
    return DevJobPayload(
        id=job.id,
        status=job.status,
        progress=job.progress,
        engines=runner_engines(job.strategy),
        strategy=job.strategy,
        requirementId=job.requirement_id,
        specId=job.spec_id,
        sourceReviewId=job.source_review_id,
    )


def serialize_finding(finding: ReviewFinding) -> ReviewFindingPayload:
    return ReviewFindingPayload(
        id=finding.id,
        severity=finding.severity,
        category=finding.category,
        title=finding.title,
        detail=finding.detail,
        evidence=finding.evidence,
    )


async def serialize_report(session: AsyncSession, report: ReviewReport) -> ReviewReportPayload:
    result = await session.execute(
        select(ReviewFinding).where(ReviewFinding.review_id == report.id)
    )
    job = await session.get(DevJob, report.job_id) if report.job_id else None
    spec = await session.get(AgentSpec, report.spec_id) if report.spec_id else None
    if not spec and job and job.spec_id:
        spec = await session.get(AgentSpec, job.spec_id)
    requirement_id = spec.requirement_id if spec else job.requirement_id if job else None
    requirement = await session.get(Requirement, requirement_id) if requirement_id else None
    optimization_result = await session.execute(
        select(DevJob)
        .where(DevJob.source_review_id == report.id)
        .order_by(DevJob.created_at.desc())
    )
    optimization_job = optimization_result.scalars().first()
    return ReviewReportPayload(
        id=report.id,
        status=report.status,
        jobId=report.job_id,
        specId=report.spec_id,
        requirementId=requirement.id if requirement else requirement_id,
        requirementTitle=requirement.title if requirement else None,
        createdAt=report.created_at.isoformat(),
        recommendedEngine=report.recommended_engine or "codex",
        score=report.score,
        hallucinationRisk=report.hallucination_risk,
        stabilityScore=report.stability_score,
        performanceScore=report.performance_score,
        summary=report.summary,
        findings=[serialize_finding(item) for item in result.scalars().all()],
        optimizationJob=serialize_job(optimization_job) if optimization_job else None,
    )


async def get_owned_report(report_id: str, session: AsyncSession, user: User) -> ReviewReport:
    report = await session.get(ReviewReport, report_id)
    if not report or report.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return report


async def resolve_review_context(
    session: AsyncSession,
    user: User,
    job_id: str | None,
    spec_id: str | None,
) -> tuple[DevJob | None, AgentSpec | None]:
    job = await session.get(DevJob, job_id) if job_id else None
    spec = await session.get(AgentSpec, spec_id) if spec_id else None
    if job and job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dev job not found")
    if spec:
        # A spec is owned transitively via its requirement; block cross-user references.
        requirement = await session.get(Requirement, spec.requirement_id)
        if not requirement or requirement.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AgentSpec not found")
    if not job and not spec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="jobId or specId required"
        )
    if job and job.spec_id and not spec:
        candidate = await session.get(AgentSpec, job.spec_id)
        if candidate:
            candidate_requirement = await session.get(Requirement, candidate.requirement_id)
            if candidate_requirement and candidate_requirement.user_id == user.id:
                spec = candidate
    return job, spec


async def create_review_record(
    session: AsyncSession,
    user_id: str,
    job: DevJob | None,
    spec: AgentSpec | None,
) -> ReviewReport:
    event_result = (
        await session.execute(select(DevJobEvent).where(DevJobEvent.job_id == job.id))
        if job
        else None
    )
    artifact_result = (
        await session.execute(select(DevJobArtifact).where(DevJobArtifact.job_id == job.id))
        if job
        else None
    )
    events = list(event_result.scalars().all()) if event_result else []
    artifacts = list(artifact_result.scalars().all()) if artifact_result else []
    analysis = analyze_review(events=events, artifacts=artifacts, spec=spec)

    report = ReviewReport(
        user_id=user_id,
        job_id=job.id if job else None,
        spec_id=spec.id if spec else None,
        status="draft",
        recommended_engine=analysis.recommended_engine,
        score=analysis.score,
        hallucination_risk=analysis.hallucination_risk,
        stability_score=analysis.stability_score,
        performance_score=analysis.performance_score,
        summary=analysis.summary,
    )
    session.add(report)
    await session.flush()

    findings = [
        ReviewFinding(
            review_id=report.id,
            severity=item["severity"],
            category=item["category"],
            title=item["title"],
            detail=item["detail"],
            evidence=item["evidence"],
        )
        for item in analysis.findings
    ]
    session.add_all(findings)
    await session.flush()
    return report


@router.post("")
async def create_review(
    body: ReviewCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job, spec = await resolve_review_context(session, current_user, body.jobId, body.specId)
    report = await create_review_record(session, current_user.id, job, spec)
    await session.commit()
    return ok(await serialize_report(session, report))


@router.get("")
async def list_reviews(
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    result = await session.execute(
        select(ReviewReport)
        .where(ReviewReport.user_id == current_user.id)
        .order_by(ReviewReport.created_at.desc())
    )
    return ok([await serialize_report(session, report) for report in result.scalars().all()])


@router.get("/latest")
async def get_latest_review(
    jobId: str | None = Query(default=None),
    specId: str | None = Query(default=None),
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    """Return the most recent review for a job/spec owned by the user, or null.

    Lets the Review page read instead of creating a report on every visit.
    """
    if not jobId and not specId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="jobId or specId required"
        )
    statement = select(ReviewReport).where(ReviewReport.user_id == current_user.id)
    if jobId:
        statement = statement.where(ReviewReport.job_id == jobId)
    if specId:
        statement = statement.where(ReviewReport.spec_id == specId)
    statement = statement.order_by(ReviewReport.created_at.desc())
    report = (await session.execute(statement)).scalars().first()
    if not report:
        return ok(None)
    return ok(await serialize_report(session, report))


@router.get("/{review_id}")
async def get_review(
    review_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    return ok(
        await serialize_report(session, await get_owned_report(review_id, session, current_user))
    )


@router.post("/{review_id}/regenerate")
async def regenerate_review(
    review_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    report = await get_owned_report(review_id, session, current_user)
    job, spec = await resolve_review_context(
        session,
        current_user,
        report.job_id,
        report.spec_id,
    )
    new_report = await create_review_record(session, current_user.id, job, spec)
    await record_audit(
        session,
        user_id=current_user.id,
        action="review.regenerate",
        resource_type="review",
        resource_id=report.id,
        payload={"newReviewId": new_report.id},
    )
    await session.commit()
    return ok(await serialize_report(session, new_report))


@router.post("/{review_id}/optimize")
async def optimize_from_review(
    review_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    report = await get_owned_report(review_id, session, current_user)
    source_job = await session.get(DevJob, report.job_id) if report.job_id else None
    spec = await session.get(AgentSpec, report.spec_id) if report.spec_id else None
    if not spec and source_job and source_job.spec_id:
        spec = await session.get(AgentSpec, source_job.spec_id)
    if source_job and source_job.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dev job not found")
    if spec:
        requirement = await session.get(Requirement, spec.requirement_id)
        if not requirement or requirement.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AgentSpec not found")

    requirement_id = (
        source_job.requirement_id
        if source_job and source_job.requirement_id
        else spec.requirement_id if spec else None
    )
    spec_id = spec.id if spec else source_job.spec_id if source_job else None
    if not requirement_id and not spec_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Review has no optimizable job or spec",
        )
    strategy = (
        "parallel"
        if source_job and source_job.strategy == "parallel"
        else report.recommended_engine or "codex"
    )
    job = DevJob(
        user_id=current_user.id,
        requirement_id=requirement_id,
        spec_id=spec_id,
        source_review_id=report.id,
        strategy=strategy,
        status="queued",
        progress=0,
    )
    session.add(job)
    await session.flush()
    session.add(
        DevJobEvent(
            job_id=job.id,
            level="info",
            phase="optimization.enqueue",
            message="已根据评审报告创建优化任务，等待桌面端本机 Runner 执行。",
            payload={"sourceReviewId": report.id},
        )
    )
    await record_audit(
        session,
        user_id=current_user.id,
        action="review.optimize",
        resource_type="review",
        resource_id=report.id,
        payload={"jobId": job.id, "strategy": strategy},
    )
    await session.commit()
    await session.refresh(job)
    return ok(await serialize_report(session, report))


@router.post("/{review_id}/accept")
async def accept_review(
    review_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    report = await get_owned_report(review_id, session, current_user)
    report.status = "accepted"
    await record_audit(
        session,
        user_id=current_user.id,
        action="review.accept",
        resource_type="review",
        resource_id=report.id,
        payload={"recommendedEngine": report.recommended_engine},
    )
    await session.commit()
    return ok(ReviewActionResponse(id=report.id, status=report.status))


@router.post("/{review_id}/rework")
async def rework_review(
    review_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    report = await get_owned_report(review_id, session, current_user)
    report.status = "rework_requested"
    await session.commit()
    return ok(ReviewActionResponse(id=report.id, status=report.status))


@router.post("/{review_id}/merge")
async def merge_review_strengths(
    review_id: str,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    report = await get_owned_report(review_id, session, current_user)
    report.status = "merge_planned"
    await record_audit(
        session,
        user_id=current_user.id,
        action="review.merge_strengths",
        resource_type="review",
        resource_id=report.id,
        payload={"recommendedEngine": report.recommended_engine},
    )
    await session.commit()
    return ok(ReviewActionResponse(id=report.id, status=report.status))
