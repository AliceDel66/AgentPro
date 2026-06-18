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
