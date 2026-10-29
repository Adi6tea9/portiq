import { getAccessToken } from "../auth/client";
import type { ApiErrorBody, Envelope } from "./types";

const DEFAULT_BASE_URL = "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string,
    public details?: { field: string; issue: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestInit extends RequestInit {
  idempotencyKey?: string;
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL;
  return configured.replace(/\/+$/, "");
}

export function buildLoginRedirectUrl(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function handleUnauthorized(): void {
  if (typeof window === "undefined") {
    return;
  }

  const returnTo = `${window.location.pathname}${window.location.search}`;

  try {
    window.location.assign(buildLoginRedirectUrl(returnTo));
  } catch {
    return;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnvelope<T>(value: unknown): value is Envelope<T> {
  if (!isRecord(value) || !("data" in value) || !isRecord(value.meta)) {
    return false;
  }

  return typeof value.meta.request_id === "string";
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    typeof value.error.request_id === "string"
  );
}

function statusToCode(status: number): string {
  const codes: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "STATE_CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "MODEL_UNAVAILABLE",
  };

  return codes[status] ?? "INTERNAL_ERROR";
}

function statusMessage(status: number): string {
  const messages: Record<number, string> = {
    400: "The request could not be processed.",
    401: "Authentication required. Please sign in.",
    403: "You do not have permission to access this resource.",
    404: "The requested resource was not found.",
    409: "That status change is not allowed.",
    422: "The request contains invalid data.",
    429: "Too many requests. Please wait and try again.",
    500: "Something went wrong. Please try again.",
    503: "The prediction service is unavailable. Try again later.",
  };

  return messages[status] ?? "Something went wrong. Please try again.";
}

/**
 * Calls the PortIQ API and returns the complete envelope, including
 * `meta.request_id`. Non-JSON and missing-request-id responses still produce a
 * typed error instead of throwing a parse error.
 */
export async function apiClient<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<Envelope<T>> {
  const { idempotencyKey, headers: initialHeaders, ...rest } = init;
  const headers = new Headers(initialHeaders);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (rest.body !== undefined && rest.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = await getAccessToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    ...rest,
    headers,
  });

  const rawBody = await response.text();
  let parsed: unknown = null;

  if (rawBody.length > 0) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = null;
    }
  }

  const envelope = isEnvelope<T>(parsed) ? parsed : null;
  const errorBody = isApiErrorBody(parsed) ? parsed : null;
  const requestId =
    envelope?.meta.request_id ?? errorBody?.error.request_id ?? "unknown";

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }

    if (errorBody) {
      throw new ApiError(
        response.status,
        errorBody.error.code,
        errorBody.error.message,
        requestId,
        errorBody.error.details,
      );
    }

    throw new ApiError(
      response.status,
      statusToCode(response.status),
      statusMessage(response.status),
      requestId,
    );
  }

  if (!envelope) {
    throw new ApiError(
      response.status,
      "INTERNAL_ERROR",
      "The server returned an unexpected response.",
      requestId,
    );
  }

  return envelope;
}

/** Creates a UUID for the `Idempotency-Key` header. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
