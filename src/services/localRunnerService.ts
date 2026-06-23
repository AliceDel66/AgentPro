import { invoke } from "@tauri-apps/api/core";
import { createReviewReport } from "./reviewService";
import {
  appendRunnerArtifact,
  appendRunnerEvent,
  getRunnerJob,
  getRunnerPackage,
  leaseRunnerJob
} from "./runnerService";
import type { RunnerDeliveryManifest, RunnerJob, RunnerPackage } from "./types";
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
  deliveryManifestPath: string;
  deliveryManifest: RunnerDeliveryManifest;
}

interface ExecuteLocalRunnerOptions {
  createReviewOnComplete?: boolean;
  onStatus?: (status: string | null) => void;
}

interface RunnerLeaseContext {
  runnerId: string;
  leaseToken: string;
}

interface RunnerCancelResult {
  engine: string;
  cancelled: boolean;
  pid?: number | null;
  message: string;
}

const DESKTOP_RUNNER_LEASE_SECONDS = 1800;
const DESKTOP_RUNNER_TIMEOUT_SECONDS = 1800;
const activeRunnerLeases = new Map<string, RunnerLeaseContext>();
const cancelledJobs = new Set<string>();

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

function runnerIdForJob(jobId: string) {
  return `agentpro-desktop-${jobId}`;
}

function withRunnerLease<T extends Record<string, unknown>>(payload: T, lease: RunnerLeaseContext): T & RunnerLeaseContext {
  return { ...payload, runnerId: lease.runnerId, leaseToken: lease.leaseToken };
}

function startEngineHeartbeat(jobId: string, label: string, start: number, end: number, lease: RunnerLeaseContext) {
  let tick = 0;
  const maxProgress = Math.max(start, end - 5);
  const step = Math.max(1, Math.floor((maxProgress - start) / 8));

  return window.setInterval(() => {
    tick += 1;
    const progress = Math.min(maxProgress, start + tick * step);
    void appendRunnerEvent(jobId, withRunnerLease({
      phase: "desktop.runner.progress",
      message: `${label} CLI 仍在本机执行中，已保持任务心跳。`,
      progress,
      status: "running"
    }, lease)).catch((error) => {
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
  total: number,
  lease: RunnerLeaseContext
) {
  const { start, end } = progressForEngine(index, total);
  const label = engineLabel(engine);
  const config = localRunnerConfig();

  try {
    const detection = await invoke<CliDetection>("detect_agent_cli", { engine });
    if (!detection.available) {
      await appendRunnerEvent(jobId, withRunnerLease({
        phase: "desktop.runner.detect",
        message: `${label} CLI 未安装或不在 PATH 中，无法在用户本机执行。`,
        level: "error",
        progress: start
      }, lease));
      await appendRunnerArtifact(jobId, withRunnerLease({
        engine,
        kind: "runner-unavailable",
        summary: `${label} CLI 不可用`,
        payload: { available: false }
      }, lease));
      return false;
    }

    await appendRunnerEvent(jobId, withRunnerLease({
      phase: "desktop.runner.start",
      message: `已连接用户本机 ${label} CLI，开始执行。`,
      progress: start,
      status: "running",
      payload: { path: detection.path ?? null }
    }, lease));

    const heartbeat = startEngineHeartbeat(jobId, label, start, end, lease);
    const result = await invoke<LocalRunnerResult>("execute_agent_runner", {
      engine,
      jobId,
      prompt: runnerPackage.prompt,
      repoPath: config.repoPath,
      workspaceRoot: config.workspaceRoot,
      timeoutSeconds: DESKTOP_RUNNER_TIMEOUT_SECONDS
    }).finally(() => {
      window.clearInterval(heartbeat);
    });
    const success = result.exitCode === 0;
    const cancelled = cancelledJobs.has(jobId);
    const timedOut = result.exitCode === 124;

    await appendRunnerArtifact(jobId, withRunnerLease({
      engine,
      kind: "run-log",
      summary: `${label} 本机执行${success ? "成功" : timedOut ? "超时" : cancelled ? "已取消" : "失败"}，退出码 ${result.exitCode}`,
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
    }, lease));
    await appendRunnerArtifact(jobId, withRunnerLease({
      engine,
      kind: "diff-summary",
      summary: result.diffStat || "未产生代码 diff",
      uri: result.workdir,
      payload: { stat: result.diffStat, diff: result.diff }
    }, lease));
    await appendRunnerArtifact(jobId, withRunnerLease({
      engine,
      kind: "delivery-manifest",
      summary: result.deliveryManifest.summary,
      uri: result.deliveryManifestPath,
      payload: result.deliveryManifest as unknown as Record<string, unknown>
    }, lease));
    await appendRunnerEvent(jobId, withRunnerLease({
      phase: "desktop.runner.finish",
      message: `${label} 本机执行${success ? "完成" : timedOut ? "超时，已终止进程" : cancelled ? "已取消" : "失败"}。`,
      level: success ? "info" : cancelled ? "warning" : "error",
      progress: end,
      payload: { exitCode: result.exitCode, durationSeconds: result.durationSeconds }
    }, lease));
    return success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendRunnerEvent(jobId, withRunnerLease({
      phase: "desktop.runner.error",
      message: `${label} 本机执行异常：${message}`,
      level: "error",
      progress: end
    }, lease));
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
  const runnerId = runnerIdForJob(jobId);
  const leaseResult = await leaseRunnerJob(jobId, runnerId, DESKTOP_RUNNER_LEASE_SECONDS);
  if (!leaseResult.data.leased || !leaseResult.data.leaseToken) {
    throw new Error("当前开发任务已被其他 Runner 接管或已结束。");
  }
  const lease: RunnerLeaseContext = { runnerId, leaseToken: leaseResult.data.leaseToken };
  activeRunnerLeases.set(jobId, lease);
  cancelledJobs.delete(jobId);

  try {
    await appendRunnerEvent(jobId, withRunnerLease({
      phase: "desktop.runner.connect",
      message: "桌面端已接管开发任务，将调用客户本机 Codex/Claude Code 执行。",
      progress: 3,
      status: "running"
    }, lease));

    const packageResult = await getRunnerPackage(jobId);
    const runnerPackage = packageResult.data;
    await appendRunnerEvent(jobId, withRunnerLease({
      phase: "desktop.runner.package",
      message: "已从后端读取 AgentSpec 开发任务包。",
      progress: 8,
      status: "running",
      payload: {
        engines: runnerPackage.engines,
        sourceReviewId: runnerPackage.sourceReviewId ?? null
      }
    }, lease));

    const results = await Promise.all(
      runnerPackage.engines.map((engine, index) =>
        executeEngine(jobId, runnerPackage, engine, index, runnerPackage.engines.length, lease)
      )
    );
    const succeeded = results.filter(Boolean).length;
    const cancelled = cancelledJobs.has(jobId);
    const finalStatus = cancelled
      ? "blocked"
      : succeeded > 0
        ? succeeded === results.length
          ? "completed"
          : "completed_with_warnings"
        : "failed";

    await appendRunnerEvent(jobId, withRunnerLease({
      phase: "desktop.runner.done",
      message: cancelled
        ? "客户本机 Runner 已取消，任务已阻塞。"
        : `客户本机 Runner 执行完成，成功 ${succeeded}/${results.length} 个引擎。`,
      level: cancelled ? "warning" : succeeded > 0 ? "info" : "error",
      progress: 100,
      status: finalStatus,
      payload: { succeeded, total: results.length }
    }, lease));
    options.onStatus?.(finalStatus);

    if (options.createReviewOnComplete && !cancelled) {
      await createReviewReport({ jobId }).catch((error) => {
        console.error("[AgentPro] 自动生成评审报告失败", error);
      });
    }

    const latest = await getRunnerJob(jobId);
    return latest.data;
  } finally {
    activeRunnerLeases.delete(jobId);
    cancelledJobs.delete(jobId);
  }
}

export async function cancelRunnerJobOnDesktop(
  jobId: string,
  engines: string[],
  message = "用户已取消本机 Runner 执行。"
) {
  if (!isTauriRuntime()) {
    throw new Error("当前不是 AgentPro 桌面端环境，无法取消本机 Runner。");
  }
  cancelledJobs.add(jobId);
  const targets = engines.length ? engines : ["codex", "claude-code"];
  const results = await Promise.allSettled(
    targets.map((engine) => invoke<RunnerCancelResult>("cancel_agent_runner", { jobId, engine }))
  );
  const lease = activeRunnerLeases.get(jobId);
  if (!lease) {
    throw new Error("当前页面没有活跃 Runner lease，无法更新任务取消状态。");
  }
  await appendRunnerEvent(jobId, withRunnerLease({
    phase: "desktop.runner.cancel",
    message,
    level: "warning",
    progress: 100,
    status: "blocked",
    payload: {
      engines: targets,
      cancelled: results.map((item) => item.status === "fulfilled" ? item.value : { cancelled: false })
    }
  }, lease));
}
