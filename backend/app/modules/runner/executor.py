from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import AgentSpec, DevJob, DevJobArtifact, DevJobEvent, Requirement

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


async def load_spec_for_job(session: AsyncSession, job: DevJob) -> AgentSpec | None:
    if job.spec_id:
        return await session.get(AgentSpec, job.spec_id)
    if not job.requirement_id:
        return None
    result = await session.execute(
        select(AgentSpec)
        .where(AgentSpec.requirement_id == job.requirement_id)
        .order_by(AgentSpec.version.desc(), AgentSpec.updated_at.desc())
    )
    return result.scalars().first()


async def load_requirement_for_job(session: AsyncSession, job: DevJob) -> Requirement | None:
    if job.requirement_id:
        return await session.get(Requirement, job.requirement_id)
    spec = await load_spec_for_job(session, job)
    if spec:
        return await session.get(Requirement, spec.requirement_id)
    return None


def prompt_for_job(job: DevJob, requirement: Requirement | None, spec: AgentSpec | None) -> str:
    payload = {
        "jobId": job.id,
        "strategy": job.strategy,
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
    prompt = prompt_for_job(job, requirement, spec)
    await add_event(
        session,
        job,
        phase="execution.prepare",
        message="已生成 AgentSpec 开发任务包，准备执行本地 Runner。",
        progress=8,
        status="running",
        payload={"hasSpec": spec is not None, "hasRequirement": requirement is not None},
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
