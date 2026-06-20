import { invoke } from "@tauri-apps/api/core";
import { createReviewReport } from "./reviewService";
import {
  appendRunnerArtifact,
  appendRunnerEvent,
  getRunnerJob,
  getRunnerPackage,
  leaseRunnerJob
} from "./runnerService";
import type { RunnerJob, RunnerPackage } from "./types";
import { getStoredRunnerWorkspaceRoot } from "../stores/runnerSettingsStore";

interface CliDetection {
  engine: "codex" | "claude-code";
  available: boolean;
  path?: string | null;
}

interface LocalRunnerResult {
  engine: "codex" | "claude-code";
  exitCode: number;
  stdout: string;
  stderr: string;
  workdir: string;
  promptPath: string;
  durationSeconds: number;
  command: string[];
  diffStat: string;
  diff: string;
}

interface ExecuteLocalRunnerOptions {
  createReviewOnComplete?: boolean;
  onStatus?: (status: string | null) => void;
}

function isTauriRuntime() {
  return Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function localRunnerConfig() {
  const savedWorkspaceRoot = getStoredRunnerWorkspaceRoot();
  return {
    repoPath: import.meta.env.VITE_AGENTPRO_LOCAL_REPO_PATH?.trim() || undefined,
    workspaceRoot: savedWorkspaceRoot || import.meta.env.VITE_AGENTPRO_LOCAL_WORKSPACE_ROOT?.trim() || undefined
  };
}

function progressForEngine(index: number, total: number) {
  const start = Math.round(10 + (index * 80) / total);
  const end = Math.round(10 + ((index + 1) * 80) / total);
  return { start, end };
}

function engineLabel(engine: "codex" | "claude-code") {
  return engine === "claude-code" ? "Claude Code" : "Codex";
}

function startEngineHeartbeat(jobId: string, label: string, start: number, end: number) {
  let tick = 0;
  const maxProgress = Math.max(start, end - 5);
  const step = Math.max(1, Math.floor((maxProgress - start) / 8));

  return window.setInterval(() => {
    tick += 1;
    const progress = Math.min(maxProgress, start + tick * step);
    void appendRunnerEvent(jobId, {
      phase: "desktop.runner.progress",
      message: `${label} CLI 仍在本机执行中，已保持任务心跳。`,
      progress,
      status: "running"
    }).catch((error) => {
      console.warn("[AgentPro] Runner 心跳上报失败", error);
    });
  }, 15000);
}

async function markBlocked(jobId: string, message: string) {
  await appendRunnerEvent(jobId, {
    phase: "desktop.runner.blocked",
    message,
    level: "error",
    progress: 100,
    status: "blocked"
  });
}

async function executeEngine(
  jobId: string,
  runnerPackage: RunnerPackage,
  engine: "codex" | "claude-code",
  index: number,
  total: number
) {
  const { start, end } = progressForEngine(index, total);
  const label = engineLabel(engine);
  const config = localRunnerConfig();

  try {
    const detection = await invoke<CliDetection>("detect_agent_cli", { engine });
    if (!detection.available) {
      await appendRunnerEvent(jobId, {
        phase: "desktop.runner.detect",
        message: `${label} CLI 未安装或不在 PATH 中，无法在用户本机执行。`,
        level: "error",
        progress: start
      });
      await appendRunnerArtifact(jobId, {
        engine,
        kind: "runner-unavailable",
        summary: `${label} CLI 不可用`,
        payload: { available: false }
      });
      return false;
    }

    await appendRunnerEvent(jobId, {
      phase: "desktop.runner.start",
      message: `已连接用户本机 ${label} CLI，开始执行。`,
      progress: start,
      status: "running",
      payload: { path: detection.path ?? null }
    });

    const heartbeat = startEngineHeartbeat(jobId, label, start, end);
    const result = await invoke<LocalRunnerResult>("execute_agent_runner", {
      engine,
      jobId,
      prompt: runnerPackage.prompt,
      repoPath: config.repoPath,
      workspaceRoot: config.workspaceRoot
    }).finally(() => {
      window.clearInterval(heartbeat);
    });
    const success = result.exitCode === 0;

    await appendRunnerArtifact(jobId, {
      engine,
      kind: "run-log",
      summary: `${label} 本机执行${success ? "成功" : "失败"}，退出码 ${result.exitCode}`,
      uri: result.workdir,
      payload: {
        exitCode: result.exitCode,
        durationSeconds: result.durationSeconds,
        stdout: result.stdout,
        stderr: result.stderr,
        command: result.command,
        promptPath: result.promptPath,
        diffStat: result.diffStat
      }
    });
    await appendRunnerArtifact(jobId, {
      engine,
      kind: "diff-summary",
      summary: result.diffStat || "未产生代码 diff",
      uri: result.workdir,
      payload: { stat: result.diffStat, diff: result.diff }
    });
    await appendRunnerEvent(jobId, {
      phase: "desktop.runner.finish",
      message: `${label} 本机执行${success ? "完成" : "失败"}。`,
      level: success ? "info" : "error",
      progress: end,
      payload: { exitCode: result.exitCode, durationSeconds: result.durationSeconds }
    });
    return success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendRunnerEvent(jobId, {
      phase: "desktop.runner.error",
      message: `${label} 本机执行异常：${message}`,
      level: "error",
      progress: end
    });
    return false;
  }
}

export async function executeRunnerJobOnDesktop(
  jobId: string,
  options: ExecuteLocalRunnerOptions = {}
): Promise<RunnerJob> {
  if (!isTauriRuntime()) {
    await markBlocked(jobId, "当前不是 AgentPro 桌面端环境，无法调用客户本机 Codex/Claude Code。");
    options.onStatus?.("blocked");
    throw new Error("当前不是 AgentPro 桌面端环境");
  }

  options.onStatus?.("running");
  await leaseRunnerJob(jobId, "agentpro-desktop-local").catch(() => null);
  await appendRunnerEvent(jobId, {
    phase: "desktop.runner.connect",
    message: "桌面端已接管开发任务，将调用客户本机 Codex/Claude Code 执行。",
    progress: 3,
    status: "running"
  });

  const packageResult = await getRunnerPackage(jobId);
  const runnerPackage = packageResult.data;
  await appendRunnerEvent(jobId, {
    phase: "desktop.runner.package",
    message: "已从后端读取 AgentSpec 开发任务包。",
    progress: 8,
    status: "running",
    payload: {
      engines: runnerPackage.engines,
      sourceReviewId: runnerPackage.sourceReviewId ?? null
    }
  });

  const results = await Promise.all(
    runnerPackage.engines.map((engine, index) =>
      executeEngine(jobId, runnerPackage, engine, index, runnerPackage.engines.length)
    )
  );
  const succeeded = results.filter(Boolean).length;
  const finalStatus = succeeded > 0
    ? succeeded === results.length
      ? "completed"
      : "completed_with_warnings"
    : "failed";

  await appendRunnerEvent(jobId, {
    phase: "desktop.runner.done",
    message: `客户本机 Runner 执行完成，成功 ${succeeded}/${results.length} 个引擎。`,
    level: succeeded > 0 ? "info" : "error",
    progress: 100,
    status: finalStatus,
    payload: { succeeded, total: results.length }
  });
  options.onStatus?.(finalStatus);

  if (options.createReviewOnComplete) {
    await createReviewReport({ jobId }).catch((error) => {
      console.error("[AgentPro] 自动生成评审报告失败", error);
    });
  }

  const latest = await getRunnerJob(jobId);
  return latest.data;
}
