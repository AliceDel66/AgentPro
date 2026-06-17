import type { ApiResult } from "./types";

const serverBaseUrl = import.meta.env.VITE_AGENTPRO_SERVER_URL ?? "";
const normalizedServerUrl = serverBaseUrl.replace(/\/$/, "");
const apiBaseUrl = normalizedServerUrl.endsWith("/api/v1")
  ? normalizedServerUrl
  : `${normalizedServerUrl}/api/v1`;

function isApiResult<T>(payload: unknown): payload is ApiResult<T> {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "ok" in payload &&
      "data" in payload
  );
}

function buildJsonHeaders(): HeadersInit {
  const token = globalThis.localStorage?.getItem("agentpro.accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function apiGet<T>(path: string, fallback: T): Promise<ApiResult<T>> {
  if (!serverBaseUrl) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: buildJsonHeaders()
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  return isApiResult<T>(payload) ? payload : { ok: true, data: payload as T };
}

export async function apiPost<TBody, TResponse>(path: string, body: TBody, fallback: TResponse): Promise<ApiResult<TResponse>> {
  if (!serverBaseUrl) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  return isApiResult<TResponse>(payload) ? payload : { ok: true, data: payload as TResponse };
}

export async function apiPut<TBody, TResponse>(path: string, body: TBody, fallback: TResponse): Promise<ApiResult<TResponse>> {
  if (!serverBaseUrl) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PUT",
    headers: buildJsonHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  return isApiResult<TResponse>(payload) ? payload : { ok: true, data: payload as TResponse };
}
