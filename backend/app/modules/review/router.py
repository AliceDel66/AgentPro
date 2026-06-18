from fastapi import APIRouter, Depends, HTTPException, status
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

router = APIRouter(prefix="/reviews")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)


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
    return ReviewReportPayload(
        id=report.id,
        status=report.status,
        recommendedEngine=report.recommended_engine or "codex",
        score=report.score,
        hallucinationRisk=report.hallucination_risk,
        stabilityScore=report.stability_score,
        performanceScore=report.performance_score,
        summary=report.summary,
        findings=[serialize_finding(item) for item in result.scalars().all()],
    )


async def get_owned_report(report_id: str, session: AsyncSession, user: User) -> ReviewReport:
    report = await session.get(ReviewReport, report_id)
    if not report or report.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return report


@router.post("")
async def create_review(
    body: ReviewCreate,
    session: AsyncSession = db_session_dependency,
    current_user: User = current_user_dependency,
):
    job = await session.get(DevJob, body.jobId) if body.jobId else None
    spec = await session.get(AgentSpec, body.specId) if body.specId else None
    if job and job.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dev job not found")
    if spec:
        # A spec is owned transitively via its requirement; block cross-user references.
        requirement = await session.get(Requirement, spec.requirement_id)
        if not requirement or requirement.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AgentSpec not found")
    if not job and not spec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="jobId or specId required"
        )
    if job and job.spec_id and not spec:
        spec = await session.get(AgentSpec, job.spec_id)

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
        user_id=current_user.id,
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
    await session.commit()
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
