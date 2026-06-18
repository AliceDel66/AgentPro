from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.db.models import AgentSpec, DevJobArtifact, DevJobEvent

SECRET_PATTERN = re.compile(
    r"(api[_ -]?key|secret|password|token|sk-[a-zA-Z0-9]{8,})",
    flags=re.IGNORECASE,
)


@dataclass
class EngineEvidence:
    engine: str
    exit_codes: list[int] = field(default_factory=list)
    durations: list[float] = field(default_factory=list)
    summaries: list[str] = field(default_factory=list)
    diff_stats: list[str] = field(default_factory=list)
    test_signals: list[str] = field(default_factory=list)
    security_hits: list[str] = field(default_factory=list)

    @property
    def has_successful_run(self) -> bool:
        return bool(self.exit_codes) and any(code == 0 for code in self.exit_codes)

    @property
    def has_failed_run(self) -> bool:
        return any(code != 0 for code in self.exit_codes)

    @property
    def has_diff(self) -> bool:
        return any(
            item.strip() and "not a git repository" not in item.lower()
            for item in self.diff_stats
        )

    @property
    def has_tests(self) -> bool:
        return bool(self.test_signals)

    @property
    def duration_seconds(self) -> float:
        return sum(self.durations)


@dataclass
class ReviewAnalysis:
    recommended_engine: str
    score: int
    hallucination_risk: int
    stability_score: int
    performance_score: int
    summary: str
    findings: list[dict[str, Any]]
    engine_scores: dict[str, int]


def clamp(value: int) -> int:
    return max(0, min(100, value))


def payload_text(payload: dict[str, Any]) -> str:
    return " ".join(str(value) for value in payload.values() if isinstance(value, str))


def evidence_for_artifacts(artifacts: list[DevJobArtifact]) -> dict[str, EngineEvidence]:
    by_engine: dict[str, EngineEvidence] = {}
    for artifact in artifacts:
        evidence = by_engine.setdefault(artifact.engine, EngineEvidence(engine=artifact.engine))
        if artifact.summary:
            evidence.summaries.append(artifact.summary)

        payload = artifact.payload or {}
        if artifact.kind == "run-log":
            exit_code = payload.get("exitCode")
            if isinstance(exit_code, int):
                evidence.exit_codes.append(exit_code)
            duration = payload.get("durationSeconds")
            if isinstance(duration, int | float):
                evidence.durations.append(float(duration))
            combined_output = " ".join(
                str(payload.get(key, "")) for key in ("stdout", "stderr", "diffStat")
            )
            if "passed" in combined_output.lower() or "通过" in combined_output:
                evidence.test_signals.append(combined_output[:500])
            if SECRET_PATTERN.search(combined_output):
                evidence.security_hits.append("Runner 输出疑似包含敏感字段")

        if artifact.kind == "diff-summary":
            diff_stat = str(payload.get("stat") or artifact.summary or "")
            diff_body = str(payload.get("diff") or "")
            evidence.diff_stats.append(diff_stat)
            if SECRET_PATTERN.search(diff_body):
                evidence.security_hits.append("代码 diff 疑似包含敏感字段")

        if artifact.kind == "test-report":
            text = payload_text(payload) or artifact.summary or ""
            if text:
                evidence.test_signals.append(text)

        if artifact.kind in {"security-scan", "secret-scan"}:
            text = payload_text(payload) or artifact.summary or ""
            if text and any(word in text.lower() for word in ["fail", "high", "secret", "泄露"]):
                evidence.security_hits.append(text[:500])
    return by_engine


def event_error_count(events: list[DevJobEvent]) -> int:
    return sum(1 for event in events if event.level == "error")


def event_success_count(events: list[DevJobEvent]) -> int:
    return sum(
        1
        for event in events
        if any(keyword in event.message.lower() for keyword in ["passed", "success", "completed"])
        or "通过" in event.message
        or "完成" in event.message
    )


def score_engine(evidence: EngineEvidence) -> int:
    score = 45
    if evidence.has_successful_run:
        score += 25
    if evidence.has_failed_run:
        score -= 25
    if evidence.has_diff:
        score += 12
    if evidence.has_tests:
        score += 12
    if evidence.security_hits:
        score -= 25
    if evidence.duration_seconds > 600:
        score -= 8
    return clamp(score)


def spec_hallucination_risk(spec: AgentSpec | None, artifacts: list[DevJobArtifact]) -> int:
    risk = 35
    if artifacts:
        risk -= 8
    if spec:
        body = spec.body or {}
        open_questions = body.get("openQuestions")
        safety_review = body.get("safetyReview")
        if isinstance(open_questions, list):
            risk += min(24, len(open_questions) * 4)
        if isinstance(safety_review, dict):
            risk_level = str(safety_review.get("riskLevel") or "").lower()
            if risk_level == "medium":
                risk += 10
            elif risk_level == "high":
                risk += 22
    return clamp(risk)


def build_findings(
    *,
    artifacts: list[DevJobArtifact],
    events: list[DevJobEvent],
    by_engine: dict[str, EngineEvidence],
    hallucination_risk: int,
) -> list[dict[str, Any]]:
    errors = event_error_count(events)
    findings: list[dict[str, Any]] = []
    findings.append(
        {
            "severity": "high" if errors else "low",
            "category": "stability",
            "title": "真实执行稳定性",
            "detail": (
                "Runner 事件中存在错误，需要返工确认。"
                if errors
                else "Runner 事件未发现阻塞错误。"
            ),
            "evidence": {"errorCount": errors},
        }
    )

    engines_without_tests = [
        engine for engine, evidence in by_engine.items() if not evidence.has_tests
    ]
    findings.append(
        {
            "severity": "medium" if engines_without_tests else "low",
            "category": "test",
            "title": "测试结果覆盖",
            "detail": (
                f"{', '.join(engines_without_tests)} 缺少可解析测试结果。"
                if engines_without_tests
                else "已从 Runner 输出或 test-report artifact 识别到测试通过信号。"
            ),
            "evidence": {
                "artifactCount": len(artifacts),
                "enginesWithoutTests": engines_without_tests,
            },
        }
    )

    security_hits = {
        engine: evidence.security_hits
        for engine, evidence in by_engine.items()
        if evidence.security_hits
    }
    findings.append(
        {
            "severity": "high" if security_hits else "low",
            "category": "security",
            "title": "敏感信息与安全扫描",
            "detail": (
                "Runner 产物中发现疑似敏感字段。"
                if security_hits
                else "Runner 产物未发现明显敏感字段。"
            ),
            "evidence": {"hits": security_hits},
        }
    )

    findings.append(
        {
            "severity": "medium" if hallucination_risk >= 45 else "low",
            "category": "hallucination",
            "title": "需求一致性与幻觉风险",
            "detail": "AgentSpec 仍有未确认项或高风险动作，需要人工复核。"
            if hallucination_risk >= 45
            else "当前产物与 AgentSpec 的结构化风险较低。",
            "evidence": {"hallucinationRisk": hallucination_risk},
        }
    )
    return findings


def analyze_review(
    *,
    events: list[DevJobEvent],
    artifacts: list[DevJobArtifact],
    spec: AgentSpec | None,
) -> ReviewAnalysis:
    by_engine = evidence_for_artifacts(artifacts)
    if not by_engine:
        by_engine = {"codex": EngineEvidence(engine="codex")}

    engine_scores = {engine: score_engine(evidence) for engine, evidence in by_engine.items()}
    recommended_engine = max(engine_scores, key=engine_scores.get)
    errors = event_error_count(events)
    successes = event_success_count(events)
    failed_runs = sum(1 for evidence in by_engine.values() if evidence.has_failed_run)
    total_duration = sum(evidence.duration_seconds for evidence in by_engine.values())
    hallucination_risk = spec_hallucination_risk(spec, artifacts)

    score = clamp(max(engine_scores.values()) + successes * 2 - errors * 8)
    stability_score = clamp(92 - errors * 12 - failed_runs * 20)
    performance_score = clamp(90 - int(total_duration // 60) * 2)
    findings = build_findings(
        artifacts=artifacts,
        events=events,
        by_engine=by_engine,
        hallucination_risk=hallucination_risk,
    )

    summary = (
        "自动评审已基于真实 Runner 事件、run-log、diff-summary、测试结果和安全信号完成。"
        f"推荐引擎：{recommended_engine}。"
    )
    return ReviewAnalysis(
        recommended_engine=recommended_engine,
        score=score,
        hallucination_risk=hallucination_risk,
        stability_score=stability_score,
        performance_score=performance_score,
        summary=summary,
        findings=findings,
        engine_scores=engine_scores,
    )
