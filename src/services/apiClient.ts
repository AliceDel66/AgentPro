import type { ApiResult } from "./types";

const serverBaseUrl = import.meta.env.VITE_AGENTPRO_SERVER_URL?.trim() ?? "";
const useMockApi = import.meta.env.VITE_AGENTPRO_MOCK_API === "true";
const normalizedServerUrl = serverBaseUrl.replace(/\/$/, "");
const apiBaseUrl = normalizedServerUrl
  ? normalizedServerUrl.endsWith("/api/v1")
    ? normalizedServerUrl
    : `${normalizedServerUrl}/api/v1`
  : "/api/v1";

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

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function detailToMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String(item.msg);
        }
        return null;
      })
      .filter(Boolean);
    return messages.length ? messages.join("；") : null;
  }
  return null;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    if ("message" in payload && typeof payload.message === "string" && payload.message) {
      return payload.message;
    }
    if ("detail" in payload) {
      return detailToMessage(payload.detail) ?? fallback;
    }
  }
  return fallback;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Request failed: ${response.status}`));
  }

  if (isApiResult<T>(payload)) {
    if (!payload.ok) {
      throw new Error(payload.message ?? "Request failed");
    }
    return payload;
  }

  return { ok: true, data: payload as T };
}

export async function apiGet<T>(path: string, fallback: T): Promise<ApiResult<T>> {
  if (useMockApi) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: buildJsonHeaders()
  });
  return parseApiResponse<T>(response);
}

export async function apiPost<TBody, TResponse>(path: string, body: TBody, fallback: TResponse): Promise<ApiResult<TResponse>> {
  if (useMockApi) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify(body)
  });
  return parseApiResponse<TResponse>(response);
}

export async function apiPut<TBody, TResponse>(path: string, body: TBody, fallback: TResponse): Promise<ApiResult<TResponse>> {
  if (useMockApi) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PUT",
    headers: buildJsonHeaders(),
    body: JSON.stringify(body)
  });
  return parseApiResponse<TResponse>(response);
}
