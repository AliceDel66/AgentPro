import type { ApiResult } from "./types";

const serverBaseUrl = import.meta.env.VITE_AGENTPRO_SERVER_URL ?? "";

export async function apiGet<T>(path: string, fallback: T): Promise<ApiResult<T>> {
  if (!serverBaseUrl) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${serverBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return { ok: true, data: (await response.json()) as T };
}

export async function apiPost<TBody, TResponse>(path: string, body: TBody, fallback: TResponse): Promise<ApiResult<TResponse>> {
  if (!serverBaseUrl) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${serverBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return { ok: true, data: (await response.json()) as TResponse };
}
