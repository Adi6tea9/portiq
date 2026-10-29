import { http, HttpResponse } from "msw";
import type {
  ApiErrorBody,
  Envelope,
  Me,
  OperatorOverview,
  Pagination,
  Prediction,
  Role,
  Shipment,
  ShipmentCreate,
  ShipmentDetail,
  ShipmentPatch,
  ShipmentStatus,
  ShipmentSummary,
  TariffRule,
  TariffRuleCreate,
  WarningCode,
} from "../api/types";
import { getMockRole } from "./role";
import { mockConfig } from "./fixtures/config";
import { mockPorts } from "./fixtures/ports";
import { mockUsersByRole } from "./fixtures/users";
import {
  mockShipmentDetails,
  mockShipments,
} from "./fixtures/shipments";
import {
  mockPredictionHistory,
  mockPredictions,
} from "./fixtures/predictions";
import {
  mockBerthCapacity,
  mockEmptyCapacity,
  mockInvalidCapacity,
  mockYardCapacity,
} from "./fixtures/capacity";
import { mockOperatorOverview, mockOperatorRows } from "./fixtures/operator";
import { mockTariffs } from "./fixtures/tariffs";
import { mockAuditLogs } from "./fixtures/audit";
import { mockErrorByCode, mockErrorResponses } from "./fixtures/errors";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUSES: readonly ShipmentStatus[] = [
  "submitted",
  "arrived",
  "cleared",
];
const WARNING_CODES: readonly WarningCode[] = [
  "DEMO_DATA",
  "CAPACITY_UNAVAILABLE",
  "EXPLANATION_UNAVAILABLE",
  "TARIFF_MISSING",
  "OUT_OF_RANGE_INPUT",
];

let requestSequence = 0;

function envelope<T>(data: T, pagination?: Pagination): Envelope<T> {
  requestSequence += 1;

  return {
    data,
    meta: {
      request_id: `req_mock_${String(requestSequence).padStart(4, "0")}`,
      generated_at: new Date().toISOString(),
      ...(pagination ? { pagination } : {}),
    },
  };
}

function paginationFrom(url: URL): { page: number; page_size: number } {
  const rawPage = Number(url.searchParams.get("page") ?? "1");
  const rawPageSize = Number(url.searchParams.get("page_size") ?? "20");
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(100, Math.max(1, Math.floor(rawPageSize)))
    : 20;

  return { page, page_size: pageSize };
}

function paginate<T>(
  items: T[],
  url: URL,
): { items: T[]; pagination: Pagination } {
  const { page, page_size } = paginationFrom(url);
  const start = (page - 1) * page_size;

  return {
    items: items.slice(start, start + page_size),
    pagination: { page, page_size, total: items.length },
  };
}

function maybeMockError(request: Request): Response | null {
  const flag = new URL(request.url).searchParams.get("mock_error");

  if (!flag) {
    return null;
  }

  const numeric = Number(flag);

  if (Number.isInteger(numeric) && mockErrorResponses[numeric]) {
    return HttpResponse.json(mockErrorResponses[numeric], { status: numeric });
  }

  const byCode = mockErrorByCode[flag];

  if (byCode) {
    return HttpResponse.json(byCode.body, { status: byCode.status });
  }

  return null;
}

function forbidden(): Response {
  return HttpResponse.json(mockErrorResponses[403], { status: 403 });
}

function notFound(): Response {
  return HttpResponse.json(mockErrorResponses[404], { status: 404 });
}

function validationError(field: string, issue: string): Response {
  const body: ApiErrorBody = {
    error: {
      code: "VALIDATION_ERROR",
      message: "The request contains invalid data.",
      details: [{ field, issue }],
      request_id: "req_mock_422",
    },
  };

  return HttpResponse.json(body, { status: 422 });
}

function currentUser(): Me {
  return mockUsersByRole[getMockRole()];
}

function hasRole(...roles: Role[]): boolean {
  return roles.includes(getMockRole());
}

function isShipmentStatus(value: string | null): value is ShipmentStatus {
  return value !== null && (STATUSES as readonly string[]).includes(value);
}

function isWarningCode(value: string | null): value is WarningCode {
  return value !== null && (WARNING_CODES as readonly string[]).includes(value);
}

function visibleShipments(): Shipment[] {
  const role = getMockRole();

  if (role === "port_operator") {
    const ports = new Set(currentUser().assigned_port_ids);
    return mockShipments.filter((shipment) => ports.has(shipment.port_id));
  }

  return mockShipments;
}

function filterShipments(shipments: Shipment[], url: URL): Shipment[] {
  const status = url.searchParams.get("status");
  const arrivalFrom = url.searchParams.get("arrival_from");
  const arrivalTo = url.searchParams.get("arrival_to");
  const query = url.searchParams.get("q")?.trim().toLowerCase();

  return shipments.filter((shipment) => {
    if (isShipmentStatus(status) && shipment.status !== status) {
      return false;
    }

    if (arrivalFrom && shipment.expected_arrival_at < arrivalFrom) {
      return false;
    }

    if (arrivalTo && shipment.expected_arrival_at > arrivalTo) {
      return false;
    }

    if (query && !shipment.reference.toLowerCase().includes(query)) {
      return false;
    }

    return true;
  });
}

function shipmentDetail(shipmentId: string): ShipmentDetail | undefined {
  return mockShipmentDetails.find((shipment) => shipment.id === shipmentId);
}

function statusCounts(shipments: Shipment[]): Record<ShipmentStatus, number> {
  return STATUSES.reduce<Record<ShipmentStatus, number>>(
    (counts, status) => {
      counts[status] = shipments.filter(
        (shipment) => shipment.status === status,
      ).length;
      return counts;
    },
    { submitted: 0, arrived: 0, cleared: 0 },
  );
}

function daysBetween(start: string, end: string): number {
  return Number(((Date.parse(end) - Date.parse(start)) / DAY_MS).toFixed(1));
}

export const handlers = [
  http.get(`${API_BASE}/me`, ({ request }) => {
    return maybeMockError(request) ?? HttpResponse.json(envelope(currentUser()));
  }),

  http.patch(`${API_BASE}/me`, async ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const body = (await request.json()) as { display_name?: string };
    const user: Me = {
      ...currentUser(),
      display_name: body.display_name ?? currentUser().display_name,
    };

    return HttpResponse.json(envelope(user));
  }),

  http.get(`${API_BASE}/config`, ({ request }) => {
    return maybeMockError(request) ?? HttpResponse.json(envelope(mockConfig));
  }),

  http.get(`${API_BASE}/ports`, ({ request }) => {
    return maybeMockError(request) ?? HttpResponse.json(envelope(mockPorts));
  }),

  http.get(`${API_BASE}/shipments/summary`, ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const summary: ShipmentSummary = {
      total: visibleShipments().length,
      status_counts: statusCounts(visibleShipments()),
    };

    return HttpResponse.json(envelope(summary));
  }),

  http.get(`${API_BASE}/shipments`, ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const url = new URL(request.url);
    const filtered = filterShipments(visibleShipments(), url);
    const { items, pagination } = paginate(filtered, url);

    return HttpResponse.json(envelope(items, pagination));
  }),

  http.post(`${API_BASE}/shipments`, async ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("importer_exporter")) {
      return forbidden();
    }

    const body = (await request.json()) as ShipmentCreate;

    if (!body.weight_kg || body.weight_kg <= 0) {
      return validationError("weight_kg", "Must be greater than 0.");
    }

    if (!/^\d{6}$/.test(body.hs_code ?? "")) {
      return validationError("hs_code", "Must be exactly 6 digits.");
    }

    const now = new Date().toISOString();
    const shipment: Shipment = {
      ...body,
      id: `ship_${crypto.randomUUID().slice(0, 8)}`,
      status: "submitted",
      actual_arrival_at: null,
      actual_cleared_at: null,
      actual_dwell_days: null,
      created_at: now,
      updated_at: now,
      latest_prediction: null,
    };

    return HttpResponse.json(envelope(shipment), { status: 201 });
  }),

  http.get(`${API_BASE}/shipments/:id/predictions/:predictionId`, ({ params, request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const prediction = mockPredictions[String(params.predictionId)];

    if (!prediction || prediction.shipment_id !== String(params.id)) {
      return notFound();
    }

    return HttpResponse.json(envelope(prediction));
  }),

  http.get(`${API_BASE}/shipments/:id/predictions`, ({ params, request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const url = new URL(request.url);
    const history = mockPredictionHistory.filter((item) =>
      Object.values(mockPredictions).some(
        (prediction) =>
          prediction.prediction_id === item.prediction_id &&
          prediction.shipment_id === String(params.id),
      ),
    );
    const { items, pagination } = paginate(history, url);

    return HttpResponse.json(envelope(items, pagination));
  }),

  http.post(`${API_BASE}/shipments/:id/prediction`, ({ params, request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!request.headers.get("Idempotency-Key")) {
      return validationError(
        "Idempotency-Key",
        "This header is required to run a prediction.",
      );
    }

    const shipment = shipmentDetail(String(params.id));

    if (!shipment) {
      return notFound();
    }

    const prediction = Object.values(mockPredictions).find(
      (item) => item.shipment_id === shipment.id,
    );

    if (!prediction) {
      return notFound();
    }

    return HttpResponse.json(envelope(prediction), { status: 201 });
  }),

  http.patch(`${API_BASE}/shipments/:id`, async ({ params, request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const shipment = shipmentDetail(String(params.id));

    if (!shipment) {
      return notFound();
    }

    if (shipment.status !== "submitted") {
      return HttpResponse.json(mockErrorResponses[409], { status: 409 });
    }

    const patch = (await request.json()) as ShipmentPatch;
    const updated: ShipmentDetail = {
      ...shipment,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    return HttpResponse.json(envelope(updated));
  }),

  http.post(`${API_BASE}/shipments/:id/events`, async ({ params, request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("port_operator", "platform_admin")) {
      return forbidden();
    }

    const shipment = shipmentDetail(String(params.id));

    if (!shipment) {
      return notFound();
    }

    const body = (await request.json()) as {
      to_status: ShipmentStatus;
      occurred_at: string;
      note?: string;
    };

    const allowed =
      (shipment.status === "submitted" && body.to_status === "arrived") ||
      (shipment.status === "arrived" && body.to_status === "cleared");

    if (!allowed) {
      return HttpResponse.json(mockErrorResponses[409], { status: 409 });
    }

    const now = new Date().toISOString();
    const updated: ShipmentDetail = {
      ...shipment,
      status: body.to_status,
      actual_arrival_at:
        body.to_status === "arrived"
          ? body.occurred_at
          : shipment.actual_arrival_at,
      actual_cleared_at:
        body.to_status === "cleared"
          ? body.occurred_at
          : shipment.actual_cleared_at,
      actual_dwell_days:
        body.to_status === "cleared"
          ? daysBetween(
              shipment.actual_arrival_at ?? shipment.created_at,
              body.occurred_at,
            )
          : shipment.actual_dwell_days,
      updated_at: now,
      events: [
        ...shipment.events,
        {
          id: `evt_${shipment.id}_${shipment.events.length + 1}`,
          shipment_id: shipment.id,
          event_type: "status_change",
          from_status: shipment.status,
          to_status: body.to_status,
          occurred_at: body.occurred_at,
          recorded_at: now,
          actor_display_name: currentUser().display_name,
          note: body.note ?? null,
        },
      ],
    };

    return HttpResponse.json(envelope(updated));
  }),

  http.get(`${API_BASE}/shipments/:id`, ({ params, request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const shipment = shipmentDetail(String(params.id));

    if (!shipment) {
      return notFound();
    }

    return HttpResponse.json(envelope(shipment));
  }),

  http.get(`${API_BASE}/capacity/forecast`, ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resource_type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (from && to) {
      const rangeDays = (Date.parse(to) - Date.parse(from)) / DAY_MS;

      if (!Number.isFinite(rangeDays) || rangeDays > 31) {
        return validationError("range", "The date range cannot exceed 31 days.");
      }
    }

    if (url.searchParams.get("mock_empty") === "1") {
      return HttpResponse.json(
        envelope(mockEmptyCapacity, {
          page: 1,
          page_size: 20,
          total: 0,
        }),
      );
    }

    if (url.searchParams.get("mock_invalid") === "1") {
      return HttpResponse.json(
        envelope(mockInvalidCapacity, {
          page: 1,
          page_size: 20,
          total: mockInvalidCapacity.length,
        }),
      );
    }

    const buckets =
      resourceType === "berth" ? mockBerthCapacity : mockYardCapacity;
    const filtered = buckets.filter((bucket) => {
      if (from && bucket.bucket_start < from) {
        return false;
      }

      if (to && bucket.bucket_start >= to) {
        return false;
      }

      return true;
    });
    const { items, pagination } = paginate(filtered, url);

    return HttpResponse.json(envelope(items, pagination));
  }),

  http.get(`${API_BASE}/operator/overview`, ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("port_operator", "platform_admin")) {
      return forbidden();
    }

    const overview: OperatorOverview = mockOperatorOverview;

    return HttpResponse.json(envelope(overview));
  }),

  http.get(`${API_BASE}/operator/shipments`, ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("port_operator", "platform_admin")) {
      return forbidden();
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const arrivalFrom = url.searchParams.get("arrival_from");
    const arrivalTo = url.searchParams.get("arrival_to");
    const minDwell = Number(
      url.searchParams.get("min_predicted_dwell_days") ?? "",
    );
    const warningCode = url.searchParams.get("warning_code");
    const atRisk = url.searchParams.get("at_risk");

    const filtered = mockOperatorRows.filter((row) => {
      if (isShipmentStatus(status) && row.shipment.status !== status) {
        return false;
      }

      if (
        arrivalFrom &&
        row.shipment.expected_arrival_at < arrivalFrom
      ) {
        return false;
      }

      if (arrivalTo && row.shipment.expected_arrival_at > arrivalTo) {
        return false;
      }

      if (
        Number.isFinite(minDwell) &&
        (row.shipment.latest_prediction?.predicted_dwell_days ?? 0) < minDwell
      ) {
        return false;
      }

      if (
        isWarningCode(warningCode) &&
        !row.warning_codes.includes(warningCode)
      ) {
        return false;
      }

      if (atRisk === "true" && row.at_risk_reasons.length === 0) {
        return false;
      }

      return true;
    });
    const { items, pagination } = paginate(filtered, url);

    return HttpResponse.json(envelope(items, pagination));
  }),

  http.get(`${API_BASE}/admin/tariffs`, ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("platform_admin")) {
      return forbidden();
    }

    const url = new URL(request.url);
    const ruleType = url.searchParams.get("rule_type");
    const portId = url.searchParams.get("port_id");
    const hsCodePrefix = url.searchParams.get("hs_code_prefix");
    const shippingLine = url.searchParams.get("shipping_line");
    const isActive = url.searchParams.get("is_active");
    const validOn = url.searchParams.get("valid_on");

    const filtered = mockTariffs.filter((rule) => {
      if (ruleType && rule.rule_type !== ruleType) {
        return false;
      }

      if (portId && rule.port_id !== portId) {
        return false;
      }

      if (hsCodePrefix && !rule.hs_code_prefix?.startsWith(hsCodePrefix)) {
        return false;
      }

      if (shippingLine && rule.shipping_line !== shippingLine) {
        return false;
      }

      if (isActive !== null && String(rule.is_active) !== isActive) {
        return false;
      }

      if (validOn) {
        if (rule.valid_from > validOn) {
          return false;
        }

        if (rule.valid_to !== null && rule.valid_to < validOn) {
          return false;
        }
      }

      return true;
    });
    const { items, pagination } = paginate(filtered, url);

    return HttpResponse.json(envelope(items, pagination));
  }),

  http.post(`${API_BASE}/admin/tariffs`, async ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("platform_admin")) {
      return forbidden();
    }

    const body = (await request.json()) as TariffRuleCreate;

    if (!body.source_note?.trim()) {
      return validationError("source_note", "A source note is required.");
    }

    if (body.valid_to !== null && body.valid_to <= body.valid_from) {
      return validationError("valid_to", "Must be after valid_from.");
    }

    const rule: TariffRule = {
      ...body,
      id: `rule_${crypto.randomUUID().slice(0, 8)}`,
      is_active: true,
    };

    return HttpResponse.json(envelope(rule), { status: 201 });
  }),

  http.patch(`${API_BASE}/admin/tariffs/:ruleId`, async ({ params, request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("platform_admin")) {
      return forbidden();
    }

    const existing = mockTariffs.find(
      (rule) => rule.id === String(params.ruleId),
    );

    if (!existing) {
      return notFound();
    }

    const patch = (await request.json()) as Partial<TariffRuleCreate>;
    const updated: TariffRule = { ...existing, ...patch };

    return HttpResponse.json(envelope(updated));
  }),

  http.get(`${API_BASE}/admin/audit-logs`, ({ request }) => {
    const error = maybeMockError(request);

    if (error) {
      return error;
    }

    if (!hasRole("platform_admin")) {
      return forbidden();
    }

    const url = new URL(request.url);
    const { items, pagination } = paginate(mockAuditLogs, url);

    return HttpResponse.json(envelope(items, pagination));
  }),
];
