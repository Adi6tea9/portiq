import type { ApiErrorBody } from "../../api/types";

export const mockErrorResponses: Record<number, ApiErrorBody> = {
  400: {
    error: {
      code: "BAD_REQUEST",
      message: "The request could not be processed.",
      request_id: "req_mock_400",
    },
  },
  401: {
    error: {
      code: "UNAUTHENTICATED",
      message: "Authentication required. Please sign in.",
      request_id: "req_mock_401",
    },
  },
  403: {
    error: {
      code: "FORBIDDEN",
      message: "You do not have permission to access this resource.",
      request_id: "req_mock_403",
    },
  },
  404: {
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
      request_id: "req_mock_404",
    },
  },
  409: {
    error: {
      code: "STATE_CONFLICT",
      message: "That status change is not allowed.",
      request_id: "req_mock_409",
    },
  },
  422: {
    error: {
      code: "VALIDATION_ERROR",
      message: "The request contains invalid data.",
      details: [{ field: "weight_kg", issue: "Must be greater than 0." }],
      request_id: "req_mock_422",
    },
  },
  429: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please wait and try again.",
      request_id: "req_mock_429",
    },
  },
  500: {
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      request_id: "req_mock_500",
    },
  },
  503: {
    error: {
      code: "MODEL_UNAVAILABLE",
      message: "The prediction service is unavailable. Try again later.",
      request_id: "req_mock_503",
    },
  },
};

export const mockErrorByCode: Record<string, { status: number; body: ApiErrorBody }> = {
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    body: {
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This request was already submitted with different details.",
        request_id: "req_mock_idem",
      },
    },
  },
  TARIFF_CONFLICT: {
    status: 409,
    body: {
      error: {
        code: "TARIFF_CONFLICT",
        message: "A tariff rule with this version already exists.",
        request_id: "req_mock_tariff",
      },
    },
  },
};
