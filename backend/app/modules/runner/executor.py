from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import (
    AgentSpec,
    DevJob,
    DevJobArtifact,
    DevJobEvent,
    Requirement,
    ReviewFinding,
    ReviewReport,
)

ENGINE_PROGRAMS = {
    "codex": "codex",
    "claude-code": "claude",
}

ENGINE_PROGRESS = {
    "codex": (20, 55),
    "claude-code": (55, 90),
}


def runner_engines(strategy: str) -> list[str]:
    if strategy == "parallel":
        return ["codex", "claude-code"]
    return [strategy]


def repo_root() -> Path:
    settings = get_settings()
    if settings.runner_repo_path:
        return Path(settings.runner_repo_path).expanduser().resolve()
    return Path(__file__).resolve().parents[4]


def workspace_root() -> Path:
    settings = get_settings()
    if settings.runner_workspace_root:
        return Path(settings.runner_workspace_root).expanduser().resolve()
    return repo_root() / ".agentpro_runs"


def trim_output(value: str) -> str:
    limit = get_settings().runner_max_output_chars
    if len(value) <= limit:
        return value
    return f"{value[:limit]}\n...[truncated {len(value) - limit} chars]"


def command_for_engine(engine: str, prompt_path: Path) -> list[str]:
    program = ENGINE_PROGRAMS[engine]
    if engine == "codex":
        return [program, "exec", "--file", str(prompt_path)]
    return [program, "--file", str(prompt_path)]


async def add_event(
    session: AsyncSession,
    job: DevJob,
    *,
    phase: str,
    message: str,
    level: str = "info",
    progress: int | None = None,
    status: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    session.add(
        DevJobEvent(
            job_id=job.id,
            level=level,
            phase=phase,
            message=message,
            payload=payload or {},
        )
    )
    if progress is not None:
        job.progress = progress
    if status:
        job.status = status
    await session.commit()


async def add_artifact(
    session: AsyncSession,
    job: DevJob,
    *,
    engine: str,
    kind: str,
    summary: str,
    uri: str | None = None,
    payload: dict[str, Any] | None = None,
) -> DevJobArtifact:
    artifact = DevJobArtifact(
        job_id=job.id,
        engine=engine,
        kind=kind,
        summary=summary,
        uri=uri,
        payload=payload or {},
    )
    session.add(artifact)
    await session.commit()
    return artifact


async def _owned_requirement(
    session: AsyncSession, requirement_id: str | None, user_id: str
) -> Requirement | None:
    if not requirement_id:
        return None
    requirement = await session.get(Requirement, requirement_id)
    if requirement and requirement.user_id == user_id:
        return requirement
    return None


async def load_spec_for_job(session: AsyncSession, job: DevJob) -> AgentSpec | None:
    spec: AgentSpec | None = None
    if job.spec_id:
        spec = await session.get(AgentSpec, job.spec_id)
    elif job.requirement_id:
        result = await session.execute(
            select(AgentSpec)
            .where(AgentSpec.requirement_id == job.requirement_id)
            .order_by(AgentSpec.version.desc(), AgentSpec.updated_at.desc())
        )
        spec = result.scalars().first()
    if spec is None:
        return None
    # Defense-in-depth: never embed a spec whose requirement isn't owned by the job's user.
    owner = await _owned_requirement(session, spec.requirement_id, job.user_id)
    return spec if owner else None


async def load_requirement_for_job(session: AsyncSession, job: DevJob) -> Requirement | None:
    if job.requirement_id:
        return await _owned_requirement(session, job.requirement_id, job.user_id)
    spec = await load_spec_for_job(session, job)
    if spec:
        return await _owned_requirement(session, spec.requirement_id, job.user_id)
    return None


async def load_source_review_for_job(
    session: AsyncSession,
    job: DevJob,
) -> tuple[ReviewReport, list[ReviewFinding]] | tuple[None, list[ReviewFinding]]:
    if not job.source_review_id:
        return None, []
    report = await session.get(ReviewReport, job.source_review_id)
    if not report or report.user_id != job.user_id:
        return None, []
    result = await session.execute(
        select(ReviewFinding)
        .where(ReviewFinding.review_id == report.id)
        .order_by(ReviewFinding.created_at.asc())
    )
    return report, list(result.scalars().all())


def review_context_payload(
    report: ReviewReport | None,
    findings: list[ReviewFinding],
) -> dict[str, Any] | None:
    if not report:
        return None
    return {
        "id": report.id,
        "status": report.status,
        "recommendedEngine": report.recommended_engine,
        "score": report.score,
        "hallucinationRisk": report.hallucination_risk,
        "stabilityScore": report.stability_score,
        "performanceScore": report.performance_score,
        "summary": report.summary,
        "findings": [
            {
                "severity": finding.severity,
                "category": finding.category,
                "title": finding.title,
                "detail": finding.detail,
                "evidence": finding.evidence,
            }
            for finding in findings
        ],
    }


def prompt_for_job(
    job: DevJob,
    requirement: Requirement | None,
    spec: AgentSpec | None,
    source_review: ReviewReport | None = None,
    source_findings: list[ReviewFinding] | None = None,
) -> str:
    payload = {
        "jobId": job.id,
        "strategy": job.strategy,
        "sourceReview": review_context_payload(source_review, source_findings or []),
        "requirement": {
            "id": requirement.id,
            "title": requirement.title,
            "status": requirement.status,
            "summary": requirement.summary,
            "maturity": requirement.maturity,
        }
        if requirement
        else None,
        "agentSpec": {
            "id": spec.id,
            "title": spec.title,
            "version": spec.version,
            "status": spec.status,
            "body": spec.body,
        }
        if spec
        else None,
    }
    return "\n".join(
        [
            "# AgentPro 开发任务",
            "",
            "你是本地开发引擎。请根据下方 AgentSpec 在当前隔离工作区完成实现。",
            "",
            "硬性要求：",
            "- 不读取或输出 .env、API Key、数据库密码、服务器密码或真实用户数据。",
            (
                "- 每个功能板块完成后保持中文 commit message；"
                "如当前工作区不允许 commit，请输出 diff 和测试报告。"
            ),
            "- 优先运行项目已有检查命令，例如 npm run typecheck、npm run build、pytest、ruff。",
            "- 最终输出完成内容、测试结果、风险和需要人工确认的问题。",
            (
                "- 如果任务上下文包含 sourceReview，请优先修复评审 findings 中的高风险、"
                "稳定性、测试覆盖和幻觉风险问题，并在最终输出中逐项说明。"
            ),
            "",
            "任务上下文 JSON：",
            "```json",
            json.dumps(payload, ensure_ascii=False, indent=2),
            "```",
        ]
    )


def copy_repo_fallback(source: Path, destination: Path) -> None:
    ignore = shutil.ignore_patterns(
        ".git",
        ".agentpro_runs",
        "node_modules",
        "dist",
        "target",
        "src-tauri/target",
        ".venv",
        "__pycache__",
        ".pytest_cache",
        ".ruff_cache",
        "*.db",
        ".env",
        ".env.*",
    )
    shutil.copytree(source, destination, ignore=ignore, dirs_exist_ok=True)


def prepare_workspace(job: DevJob, engine: str) -> Path:
    root = workspace_root() / job.id / engine
    if root.exists():
        shutil.rmtree(root)
    root.parent.mkdir(parents=True, exist_ok=True)

    source = repo_root()
    worktree_command = ["git", "worktree", "add", "--detach", str(root), "HEAD"]
    result = subprocess.run(
        worktree_command,
        cwd=source,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        copy_repo_fallback(source, root)
    return root


async def collect_git_diff(workdir: Path) -> dict[str, str]:
    async def run_git(args: list[str]) -> str:
        process = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=workdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            return stderr.decode(errors="replace")
        return stdout.decode(errors="replace")

    return {
        "stat": trim_output(await run_git(["diff", "--stat"])),
        "diff": trim_output(await run_git(["diff"])),
    }


async def collect_git_status_files(workdir: Path) -> dict[str, list[str]]:
    process = await asyncio.create_subprocess_exec(
        "git",
        "status",
        "--porcelain",
        cwd=workdir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    status = (
        stdout.decode(errors="replace")
        if process.returncode == 0
        else stderr.decode(errors="replace")
    )
    changed_files: list[str] = []
    untracked_files: list[str] = []
    for line in status.splitlines():
        code = line[:2].strip()
        path = line[3:].strip() if len(line) > 3 else ""
        if not path:
            continue
        if code == "??":
            untracked_files.append(path)
        else:
            changed_files.append(path)
    return {"changedFiles": changed_files, "untrackedFiles": untracked_files}


async def build_delivery_manifest(job: DevJob, engine: str, workdir: Path) -> dict[str, Any]:
    status_files = await collect_git_status_files(workdir)
    dist_index = workdir / "dist" / "index.html"
    readme = workdir / "README.md"
    entrypoints: list[dict[str, str]] = [
        {"label": "Runner 工作区", "kind": "workspace", "path": str(workdir)}
    ]
    if dist_index.exists():
        entrypoints.append({"label": "构建产物", "kind": "build", "path": str(dist_index)})
    if readme.exists():
        entrypoints.append({"label": "运行说明", "kind": "readme", "path": str(readme)})
    return {
        "version": 1,
        "jobId": job.id,
        "engine": engine,
        "workspacePath": str(workdir),
        "deliverableType": "agentpro_patch",
        "summary": "本次产物是 AgentPro 源码补丁，而不是独立安装包。",
        "entrypoints": entrypoints,
        "changedFiles": status_files["changedFiles"],
        "untrackedFiles": status_files["untrackedFiles"],
        "previewCommand": "npm run preview -- --host 127.0.0.1",
        "buildArtifactMissing": not dist_index.exists(),
        "createdAt": datetime.now(UTC).isoformat(),
    }


async def run_process(command: list[str], workdir: Path) -> tuple[int, str, str, float]:
    started = time.perf_counter()
    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=workdir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=get_settings().runner_command_timeout_seconds,
        )
    except TimeoutError:
        process.kill()
        stdout, stderr = await process.communicate()
        duration = time.perf_counter() - started
        return (
            124,
            trim_output(stdout.decode(errors="replace")),
            "Runner command timed out",
            duration,
        )

    duration = time.perf_counter() - started
    return (
        process.returncode or 0,
        trim_output(stdout.decode(errors="replace")),
        trim_output(stderr.decode(errors="replace")),
        duration,
    )


async def execute_engine(
    session: AsyncSession,
    job: DevJob,
    engine: str,
    prompt: str,
) -> bool:
    start_progress, end_progress = ENGINE_PROGRESS.get(engine, (20, 90))
    program = ENGINE_PROGRAMS.get(engine)
    if not program:
        await add_event(
            session,
            job,
            phase="engine.unsupported",
            message=f"不支持的开发引擎：{engine}",
            level="error",
            progress=start_progress,
        )
        return False

    program_path = shutil.which(program)
    if not program_path:
        await add_event(
            session,
            job,
            phase="engine.detect",
            message=f"{engine} CLI 未安装或不在 PATH 中，无法执行真实开发。",
            level="error",
            progress=start_progress,
        )
        await add_artifact(
            session,
            job,
            engine=engine,
            kind="runner-unavailable",
            summary=f"{engine} CLI 不可用",
            payload={"program": program, "available": False},
        )
        return False

    workdir = prepare_workspace(job, engine)
    prompt_path = workdir / "agentpro-runner-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    command = command_for_engine(engine, prompt_path)
    command[0] = program_path

    await add_event(
        session,
        job,
        phase="engine.start",
        message=f"开始执行 {engine} CLI",
        progress=start_progress,
        payload={"workdir": str(workdir), "command": [program, *command[1:]]},
    )
    exit_code, stdout, stderr, duration = await run_process(command, workdir)
    success = exit_code == 0
    diff = await collect_git_diff(workdir)

    log_path = workdir / "agentpro-runner-output.json"
    log_payload = {
        "engine": engine,
        "exitCode": exit_code,
        "durationSeconds": round(duration, 2),
        "stdout": stdout,
        "stderr": stderr,
        "diffStat": diff["stat"],
    }
    log_path.write_text(json.dumps(log_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    await add_artifact(
        session,
        job,
        engine=engine,
        kind="run-log",
        summary=f"{engine} 执行{'成功' if success else '失败'}，退出码 {exit_code}",
        uri=str(log_path),
        payload=log_payload,
    )
    await add_artifact(
        session,
        job,
        engine=engine,
        kind="diff-summary",
        summary=diff["stat"] or "未产生代码 diff",
        uri=str(workdir),
        payload=diff,
    )
    delivery_manifest = await build_delivery_manifest(job, engine, workdir)
    delivery_manifest_path = workdir / "agentpro-delivery.json"
    delivery_manifest_path.write_text(
        json.dumps(delivery_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    await add_artifact(
        session,
        job,
        engine=engine,
        kind="delivery-manifest",
        summary=delivery_manifest["summary"],
        uri=str(delivery_manifest_path),
        payload=delivery_manifest,
    )
    await add_event(
        session,
        job,
        phase="engine.finish",
        message=f"{engine} CLI 执行{'完成' if success else '失败'}",
        level="info" if success else "error",
        progress=end_progress,
        payload={"exitCode": exit_code, "durationSeconds": round(duration, 2)},
    )
    return success


async def execute_dev_job(session: AsyncSession, job: DevJob) -> DevJob:
    if not get_settings().runner_execution_effective:
        await add_event(
            session,
            job,
            phase="execution.disabled",
            message="当前环境未启用真实 Runner 执行。",
            level="warning",
            progress=0,
            status="blocked",
        )
        return job

    requirement = await load_requirement_for_job(session, job)
    spec = await load_spec_for_job(session, job)
    source_review, source_findings = await load_source_review_for_job(session, job)
    prompt = prompt_for_job(job, requirement, spec, source_review, source_findings)
    await add_event(
        session,
        job,
        phase="execution.prepare",
        message="已生成 AgentSpec 开发任务包，准备执行本地 Runner。",
        progress=8,
        status="running",
        payload={
            "hasSpec": spec is not None,
            "hasRequirement": requirement is not None,
            "sourceReviewId": source_review.id if source_review else None,
        },
    )

    results = []
    for engine in runner_engines(job.strategy):
        results.append(await execute_engine(session, job, engine, prompt))

    succeeded = sum(1 for item in results if item)
    if succeeded:
        status = "completed" if succeeded == len(results) else "completed_with_warnings"
        message = f"真实 Runner 执行完成，成功 {succeeded}/{len(results)} 个引擎。"
    else:
        status = "failed"
        message = "真实 Runner 执行失败：没有可用引擎成功完成。"

    await add_event(
        session,
        job,
        phase="execution.done",
        message=message,
        level="info" if succeeded else "error",
        progress=100,
        status=status,
        payload={"succeeded": succeeded, "total": len(results)},
    )
    await session.refresh(job)
    return job
