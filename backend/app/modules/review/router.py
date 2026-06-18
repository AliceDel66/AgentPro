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
from app.modules.review.schemas import (
    ReviewActionResponse,
    ReviewCreate,
    ReviewFindingPayload,
    ReviewReportPayload,
)

router = APIRouter(prefix="/reviews")
db_session_dependency = Depends(get_db_session)
current_user_dependency = Depends(get_current_user)


def clamp_score(value: int) -> int:
    return max(0, min(100, value))


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
    error_count = sum(1 for event in events if event.level == "error")
    passed_checks = sum(
        1
        for event in events
        if any(keyword in event.message.lower() for keyword in ["passed", "通过", "success"])
    )

    recommended_engine = artifacts[0].engine if artifacts else "codex"
    score = clamp_score(72 + len(artifacts) * 6 + passed_checks * 4 - error_count * 12)
    stability_score = clamp_score(88 - error_count * 15)
    performance_score = clamp_score(76 + passed_checks * 5)
    hallucination_risk = 18 if spec else 35
    if spec and spec.body.get("safetyReview", {}).get("riskLevel") == "medium":
        hallucination_risk += 8

    report = ReviewReport(
        user_id=current_user.id,
        job_id=job.id if job else None,
        spec_id=spec.id if spec else None,
        status="draft",
        recommended_engine=recommended_engine,
        score=score,
        hallucination_risk=clamp_score(hallucination_risk),
        stability_score=stability_score,
        performance_score=performance_score,
        summary="自动评审已基于开发日志、产物摘要和 AgentSpec 完成初评。",
    )
    session.add(report)
    await session.flush()

    findings = [
        ReviewFinding(
            review_id=report.id,
            severity="medium" if error_count else "low",
            category="stability",
            title="稳定性检查",
            detail="发现错误日志，需要返工确认。" if error_count else "未发现阻塞性错误日志。",
            evidence={"errorCount": error_count},
        ),
        ReviewFinding(
            review_id=report.id,
            severity="low",
            category="hallucination",
            title="幻觉风险检查",
            detail="高风险动作需要保留人工审批和审计记录。",
            evidence={"hallucinationRisk": report.hallucination_risk},
        ),
        ReviewFinding(
            review_id=report.id,
            severity="low" if artifacts else "medium",
            category="completeness",
            title="产物完整度",
            detail="已收到 runner 产物摘要。" if artifacts else "未收到 runner 产物摘要。",
            evidence={"artifactCount": len(artifacts)},
        ),
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
