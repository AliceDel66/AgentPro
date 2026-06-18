import type { ApiResult, AuthSession } from "./types";

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

const ACCESS_TOKEN_KEY = "agentpro.accessToken";
const REFRESH_TOKEN_KEY = "agentpro.refreshToken";

function buildJsonHeaders(): HeadersInit {
  const token = globalThis.localStorage?.getItem(ACCESS_TOKEN_KEY);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function clearStoredTokens(): void {
  globalThis.localStorage?.removeItem(ACCESS_TOKEN_KEY);
  globalThis.localStorage?.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = globalThis.localStorage?.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) {
      clearStoredTokens();
      return false;
    }
    const payload = await readJsonPayload(response);
    const session = (isApiResult<AuthSession>(payload) ? payload.data : payload) as AuthSession | null;
    if (session?.accessToken && session?.refreshToken) {
      globalThis.localStorage?.setItem(ACCESS_TOKEN_KEY, session.accessToken);
      globalThis.localStorage?.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
      return true;
    }
    clearStoredTokens();
    return false;
  } catch {
    return false;
  }
}

// De-duplicate concurrent refreshes so a burst of 401s triggers a single /auth/refresh call.
function ensureRefreshed(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function authedFetch(path: string, init: { method: string; body?: string }): Promise<Response> {
  const send = () =>
    fetch(`${apiBaseUrl}${path}`, {
      method: init.method,
      headers: buildJsonHeaders(),
      body: init.body
    });

  const response = await send();
  // On an expired access token, refresh once and replay — but never for the auth endpoints themselves.
  if (response.status === 401 && !path.startsWith("/auth/")) {
    if (await ensureRefreshed()) {
      return send();
    }
  }
  return response;
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

  const response = await authedFetch(path, { method: "GET" });
  return parseApiResponse<T>(response);
}

export async function apiPost<TBody, TResponse>(path: string, body: TBody, fallback: TResponse): Promise<ApiResult<TResponse>> {
  if (useMockApi) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
  return parseApiResponse<TResponse>(response);
}

export async function apiPut<TBody, TResponse>(path: string, body: TBody, fallback: TResponse): Promise<ApiResult<TResponse>> {
  if (useMockApi) {
    return { ok: true, data: fallback, message: "mock fallback" };
  }

  const response = await authedFetch(path, { method: "PUT", body: JSON.stringify(body) });
  return parseApiResponse<TResponse>(response);
}
