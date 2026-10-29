import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { getAccessToken } from "../auth/client";
import {
  ApiError,
  apiClient,
  buildLoginRedirectUrl,
  createIdempotencyKey,
  getApiBaseUrl,
} from "./client";

vi.mock("../auth/client", () => ({
  getAccessToken: vi.fn(),
}));

const getAccessTokenMock = getAccessToken as Mock;

function envelope<T>(data: T, requestId = "req_001") {
  return {
    data,
    meta: { request_id: requestId, generated_at: "2026-10-29T00:00:00Z" },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000/api/v1";
    fetchMock.mockReset();
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("composes the base URL and path", async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelope({ ok: true })));

    await apiClient("/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/me",
      expect.any(Object),
    );
  });

  it("normalizes a trailing slash in the configured base URL", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000/api/v1/";
    fetchMock.mockResolvedValue(jsonResponse(envelope({ ok: true })));

    await apiClient("/ports");

    expect(getApiBaseUrl()).toBe("http://localhost:8000/api/v1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/ports",
      expect.any(Object),
    );
  });

  it("attaches a bearer token when a session exists", async () => {
    getAccessTokenMock.mockResolvedValue("access-token");
    fetchMock.mockResolvedValue(jsonResponse(envelope({ ok: true })));

    await apiClient("/me");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("omits authorization when no session exists", async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelope({ ok: true })));

    await apiClient("/me");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).has("Authorization")).toBe(false);
  });

  it("sends an Idempotency-Key when provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelope({ ok: true })));

    await apiClient("/shipments/ship_001/prediction", {
      method: "POST",
      idempotencyKey: "11111111-1111-1111-1111-111111111111",
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get("Idempotency-Key")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("returns the complete envelope including meta.request_id", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(envelope({ user_id: "user_1" }, "req_abc")),
    );

    const result = await apiClient<{ user_id: string }>("/me");

    expect(result.data.user_id).toBe("user_1");
    expect(result.meta.request_id).toBe("req_abc");
  });

  it("throws a typed error for 401 with the API code", async () => {
    vi.stubGlobal("window", undefined);
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required.",
            request_id: "req_401",
          },
        },
        401,
      ),
    );

    await expect(apiClient("/me")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      requestId: "req_401",
    });
  });

  it("throws typed errors for 403 and 404", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "FORBIDDEN",
            message: "No access.",
            request_id: "req_403",
          },
        },
        403,
      ),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "NOT_FOUND",
            message: "Not found.",
            request_id: "req_404",
          },
        },
        404,
      ),
    );

    await expect(apiClient("/admin/tariffs")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    await expect(apiClient("/shipments/missing")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("falls back safely when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>bad gateway</html>", { status: 500 }),
    );

    const error = await apiClient("/shipments").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      requestId: "unknown",
    });
  });

  it("falls back to an unknown request id when meta omits it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { ok: true }, meta: {} }),
    );

    const error = await apiClient("/me").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ requestId: "unknown" });
  });

  it("builds the login redirect with an encoded return path", () => {
    expect(buildLoginRedirectUrl("/shipments?status=arrived")).toBe(
      "/login?returnTo=%2Fshipments%3Fstatus%3Darrived",
    );
  });

  it("creates a UUID idempotency key", () => {
    expect(createIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
