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


def clip_text(value: str, limit: int = 180) -> str:
    text = " ".join(value.split())
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1]}..."


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


def event_engine(event: DevJobEvent) -> str | None:
    payload = event.payload or {}
    engine = payload.get("engine")
    if isinstance(engine, str) and engine:
        return engine
    message = event.message.lower()
    if "claude" in message:
        return "claude-code"
    if "codex" in message:
        return "codex"
    return None


def has_test_evidence(
    artifacts: list[DevJobArtifact], by_engine: dict[str, EngineEvidence]
) -> bool:
    return any(artifact.kind == "test-report" for artifact in artifacts) or any(
        evidence.has_tests for evidence in by_engine.values()
    )


def delivery_manifest_payload(artifacts: list[DevJobArtifact]) -> dict[str, Any] | None:
    for artifact in artifacts:
        if artifact.kind == "delivery-manifest" and isinstance(artifact.payload, dict):
            return artifact.payload
    return None


def delivery_manifest_advice(manifest: dict[str, Any]) -> str:
    deliverable_type = str(manifest.get("deliverableType") or "unknown")
    type_label = {
        "agentpro_patch": "AgentPro 源码补丁",
        "in_app_agent": "AgentPro 内置 Agent",
        "external_connector": "外部平台连接器",
        "standalone_service": "独立服务",
    }.get(deliverable_type, deliverable_type)
    entrypoints = manifest.get("entrypoints")
    entry_count = len(entrypoints) if isinstance(entrypoints, list) else 0
    preview_command = str(manifest.get("previewCommand") or "").strip()
    build_missing = bool(manifest.get("buildArtifactMissing"))
    advice = f"当前产物已生成交付清单，类型为{type_label}，包含 {entry_count} 个可打开入口。"
    if preview_command:
        advice += f" 可使用 `{preview_command}` 进行本地预览。"
    if build_missing:
        advice += " 交付清单未发现构建产物，正式交付前需要补充构建或说明运行方式。"
    return advice


def security_hit_count(by_engine: dict[str, EngineEvidence]) -> int:
    return sum(len(evidence.security_hits) for evidence in by_engine.values())


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


def build_evidence_sources(
    *, events: list[DevJobEvent], artifacts: list[DevJobArtifact]
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for event in events:
        sources.append(
            {
                "id": f"event:{event.id}",
                "type": "event",
                "engine": event_engine(event),
                "summary": clip_text(event.message or event.phase),
                "artifactId": None,
                "eventId": event.id,
                "uri": None,
                "payload": None,
                "createdAt": event.created_at.isoformat(),
            }
        )
    for artifact in artifacts:
        payload = artifact.payload or {}
        payload_summary = payload_text(payload)
        sources.append(
            {
                "id": f"artifact:{artifact.id}",
                "type": artifact.kind,
                "engine": artifact.engine,
                "summary": clip_text(artifact.summary or payload_summary or artifact.kind),
                "artifactId": artifact.id,
                "eventId": None,
                "uri": artifact.uri,
                "payload": payload if artifact.kind == "delivery-manifest" else None,
                "createdAt": artifact.created_at.isoformat(),
            }
        )
    return sources


def build_score_breakdown(
    *,
    score: int,
    hallucination_risk: int,
    stability_score: int,
    performance_score: int,
    artifacts: list[DevJobArtifact],
    events: list[DevJobEvent],
    by_engine: dict[str, EngineEvidence],
    spec: AgentSpec | None,
) -> list[dict[str, Any]]:
    has_artifacts = bool(artifacts)
    has_tests = has_test_evidence(artifacts, by_engine)
    has_diff = any(evidence.has_diff for evidence in by_engine.values())
    errors = event_error_count(events)
    successes = event_success_count(events)
    open_questions_count = 0
    if spec:
        open_questions = (spec.body or {}).get("openQuestions")
        if isinstance(open_questions, list):
            open_questions_count = len(open_questions)
    security_hits = security_hit_count(by_engine)

    return [
        {
            "key": "functionality",
            "label": "功能完成度",
            "score": clamp(score if has_artifacts else min(score, 55)),
            "reason": (
                "已识别到开发产物、执行日志和代码 diff，具备基础完成度证据。"
                if has_artifacts and has_diff
                else "当前缺少可验证开发产物或代码 diff，只能给出保守初评。"
            ),
            "evidenceCount": len(artifacts),
        },
        {
            "key": "requirement_match",
            "label": "需求一致性",
            "score": clamp(100 - hallucination_risk),
            "reason": (
                "AgentSpec 未确认项较少，需求一致性风险可控。"
                if open_questions_count == 0
                else f"AgentSpec 仍有 {open_questions_count} 个未确认项，需人工复核。"
            ),
            "evidenceCount": 1 if spec else 0,
        },
        {
            "key": "stability",
            "label": "稳定性",
            "score": stability_score,
            "reason": (
                "Runner 事件未发现阻塞错误。"
                if errors == 0
                else f"Runner 事件包含 {errors} 个错误，需要返工确认。"
            ),
            "evidenceCount": len(events),
        },
        {
            "key": "performance",
            "label": "性能",
            "score": performance_score,
            "reason": (
                "执行耗时未出现明显异常。"
                if performance_score >= 75
                else "执行耗时偏高，需要关注实现复杂度和测试耗时。"
            ),
            "evidenceCount": len(
                [event for event in events if "duration" in payload_text(event.payload)]
            ),
        },
        {
            "key": "hallucination",
            "label": "幻觉风险",
            "score": clamp(100 - hallucination_risk),
            "reason": (
                "当前结构化风险较低。"
                if hallucination_risk < 45
                else "存在未确认需求或高风险动作，不能直接信任生成产物。"
            ),
            "evidenceCount": 1 if spec else 0,
        },
        {
            "key": "security",
            "label": "安全风险",
            "score": clamp(100 - security_hits * 30),
            "reason": (
                "未在 Runner 产物中发现明显敏感字段。"
                if security_hits == 0
                else f"发现 {security_hits} 条疑似安全或敏感信息信号。"
            ),
            "evidenceCount": security_hits,
        },
        {
            "key": "test_coverage",
            "label": "测试覆盖",
            "score": 88 if has_tests else 42,
            "reason": (
                f"已识别到测试通过信号或 test-report，成功事件 {successes} 条。"
                if has_tests
                else "缺少 test-report 或可解析测试通过信号，当前结论证据不足。"
            ),
            "evidenceCount": len(
                [artifact for artifact in artifacts if artifact.kind == "test-report"]
            ),
        },
    ]


def action_text_for_category(category: str) -> tuple[str, str]:
    if category == "stability":
        return (
            "复现 Runner 错误事件，修复导致任务失败或阻塞的代码路径。",
            "重新运行本地 Runner，并确认监控页最终状态为 completed 或 completed_with_warnings。",
        )
    if category == "test":
        return (
            "补充可自动执行的测试命令和测试报告输出，确保报告能解析到通过/失败信号。",
            "重新生成评审报告，确认测试覆盖维度不再显示证据不足。",
        )
    if category == "security":
        return (
            "检查 diff、日志和配置样例，移除 API Key、密码、token 等敏感信息。",
            "运行敏感信息扫描，并确认评审证据链中无高风险命中。",
        )
    if category == "hallucination":
        return (
            "回到 AgentSpec 或需求访谈补齐未确认项，明确权限边界、失败处理和验收标准。",
            "人工确认关键需求后重新开发或重新评审。",
        )
    return (
        "按该发现补齐实现、文档或验证证据。",
        "重新运行相关测试并重新生成评审报告。",
    )


def build_action_plan(
    *, findings: list[Any], artifacts: list[DevJobArtifact], by_engine: dict[str, EngineEvidence]
) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    sorted_findings = sorted(
        findings,
        key=lambda item: severity_rank.get(str(getattr(item, "severity", "")).lower(), 3),
    )
    for index, finding in enumerate(sorted_findings, start=1):
        severity = str(getattr(finding, "severity", "low")).lower()
        category = str(getattr(finding, "category", "general"))
        recommended_change, validation_method = action_text_for_category(category)
        priority = "high" if severity == "high" else "medium" if severity == "medium" else "low"
        plan.append(
            {
                "id": f"plan-{index}",
                "priority": priority,
                "title": f"处理：{getattr(finding, 'title', '评审发现')}",
                "reason": getattr(finding, "detail", ""),
                "recommendedChange": recommended_change,
                "validationMethod": validation_method,
                "sourceFindingIds": [getattr(finding, "id", "")],
                "reworkRecommended": priority in {"high", "medium"},
            }
        )

    if not artifacts or not has_test_evidence(artifacts, by_engine):
        plan.insert(
            0,
            {
                "id": "plan-evidence-gap",
                "priority": "high",
                "title": "补齐评审证据",
                "reason": (
                    "当前报告缺少开发产物或 test-report，存在证据不足，结论只能作为保守初评。"
                ),
                "recommendedChange": (
                    "重新执行本机 Runner，并确保上传 run-log、diff-summary 和 test-report。"
                ),
                "validationMethod": (
                    "报告详情页的证据链至少包含 run-log、diff-summary 和 test-report。"
                ),
                "sourceFindingIds": [
                    getattr(finding, "id", "")
                    for finding in findings
                    if str(getattr(finding, "category", "")) == "test"
                ],
                "reworkRecommended": True,
            },
        )
    return plan


def build_delivery_advice(
    *,
    score: int,
    hallucination_risk: int,
    artifacts: list[DevJobArtifact],
    action_plan: list[dict[str, Any]],
) -> str:
    manifest = delivery_manifest_payload(artifacts)
    high_priority = any(item["priority"] == "high" for item in action_plan)
    if manifest:
        advice = delivery_manifest_advice(manifest)
        if high_priority or hallucination_risk >= 45:
            return f"{advice} 但评审仍存在高优先级风险，建议先按优化方案返工后再交付。"
        if score >= 85:
            return f"{advice} 当前评分达到内部试用门槛，可进入交付验收。"
        return f"{advice} 当前建议作为候选版本保留，完成优化后再交付。"
    if not artifacts:
        return "当前缺少可审查产物，建议先完成真实 Runner 执行并重新生成评审报告。"
    if high_priority or hallucination_risk >= 45:
        return "当前不建议直接交付给最终用户，应先按优化方案返工，再重新生成评审报告。"
    if score >= 85:
        return "当前产物具备内部试用条件，可进入 Agent 成品库或交付集成文档准备阶段。"
    return "当前产物可作为候选版本保留，建议完成中优先级优化后再交付。"


def build_review_details(
    *,
    events: list[DevJobEvent],
    artifacts: list[DevJobArtifact],
    spec: AgentSpec | None,
    findings: list[Any],
    score: int,
    hallucination_risk: int,
    stability_score: int,
    performance_score: int,
) -> dict[str, Any]:
    by_engine = evidence_for_artifacts(artifacts)
    if not by_engine:
        by_engine = {"codex": EngineEvidence(engine="codex")}
    score_breakdown = build_score_breakdown(
        score=score,
        hallucination_risk=hallucination_risk,
        stability_score=stability_score,
        performance_score=performance_score,
        artifacts=artifacts,
        events=events,
        by_engine=by_engine,
        spec=spec,
    )
    action_plan = build_action_plan(findings=findings, artifacts=artifacts, by_engine=by_engine)
    return {
        "scoreBreakdown": score_breakdown,
        "evidenceSources": build_evidence_sources(events=events, artifacts=artifacts),
        "actionPlan": action_plan,
        "deliveryAdvice": build_delivery_advice(
            score=score,
            hallucination_risk=hallucination_risk,
            artifacts=artifacts,
            action_plan=action_plan,
        ),
    }


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
