import { invoke } from "@tauri-apps/api/core";

export function isTauriRuntime() {
  return Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function openLocalPath(path: string) {
  if (!isTauriRuntime()) {
    throw new Error("当前不是 AgentPro 桌面端环境，无法打开本机目录。");
  }
  await invoke("open_local_path", { path });
}

export async function getDefaultRunnerWorkspaceRoot() {
  if (!isTauriRuntime()) {
    return "~/AgentPro/runs";
  }
  return invoke<string>("get_default_runner_workspace_root");
}

export async function selectRunnerWorkspaceRoot() {
  if (!isTauriRuntime()) {
    throw new Error("当前不是 AgentPro 桌面端环境，无法选择本机目录。");
  }
  return invoke<string | null>("select_runner_workspace_root");
}
