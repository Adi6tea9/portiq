import { apiClient } from "../api/client";
import type {
  Pagination,
  Port,
  Shipment,
  ShipmentCreate,
  ShipmentDetail,
  ShipmentPatch,
  ShipmentEvent,
  EventCreate,
  PredictionHistoryItem,
  Prediction,
  ShipmentSummary,
} from "../api/types";
import { buildShipmentListQuery, type ShipmentListQuery } from "./query";

export type { ShipmentDetail, PredictionHistoryItem };

export interface ShipmentListRequest extends ShipmentListQuery {
  mockError?: string;
  mockEmpty?: boolean;
}

export interface ShipmentListResult {
  shipments: Shipment[];
  pagination: Pagination;
}

function withMockError(path: string, mockError?: string): string {
  return withMockParam(path, mockError);
}

function withMockParam(
  path: string,
  value: string | undefined,
  param = "mock_error",
): string {
  if (!value) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${param}=${encodeURIComponent(value)}`;
}

export async function fetchPorts(mockError?: string): Promise<Port[]> {
  const response = await apiClient<Port[]>(withMockError("/ports", mockError));
  return response.data;
}

export async function fetchShipments(
  request: ShipmentListRequest,
): Promise<ShipmentListResult> {
  const query = buildShipmentListQuery(request);
  const withEmpty = request.mockEmpty
    ? withMockParam(`/shipments?${query}`, "1", "mock_empty")
    : `/shipments?${query}`;
  const response = await apiClient<Shipment[]>(
    withMockError(withEmpty, request.mockError),
  );

  return {
    shipments: response.data,
    pagination:
      response.meta.pagination ?? {
        page: request.page,
        page_size: request.pageSize,
        total: response.data.length,
      },
  };
}

export async function fetchShipmentSummary(
  mockEmpty?: boolean,
): Promise<ShipmentSummary> {
  const response = await apiClient<ShipmentSummary>(
    withMockParam("/shipments/summary", mockEmpty ? "1" : undefined, "mock_empty"),
  );
  return response.data;
}

export async function createShipment(
  payload: ShipmentCreate,
  mockError?: string,
): Promise<Shipment> {
  const response = await apiClient<Shipment>(
    withMockError("/shipments", mockError),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return response.data;
}

export async function fetchShipmentDetail(
  id: string,
  mockError?: string,
): Promise<ShipmentDetail> {
  const response = await apiClient<ShipmentDetail>(
    withMockError(`/shipments/${id}`, mockError),
  );
  return response.data;
}

export async function updateShipment(
  id: string,
  patch: ShipmentPatch,
  mockError?: string,
): Promise<ShipmentDetail> {
  const response = await apiClient<ShipmentDetail>(
    withMockError(`/shipments/${id}`, mockError),
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return response.data;
}

export async function recordShipmentEvent(
  id: string,
  event: EventCreate,
  eventMockError?: string,
): Promise<ShipmentDetail> {
  const response = await apiClient<ShipmentDetail>(
    withMockParam(
      `/shipments/${id}/events`,
      eventMockError,
      "mock_event_error",
    ),
    {
      method: "POST",
      body: JSON.stringify(event),
    },
  );
  return response.data;
}

export async function fetchPredictionHistory(
  id: string,
  page = 1,
  pageSize = 20,
  mockError?: string,
): Promise<{ history: PredictionHistoryItem[]; pagination: Pagination }> {
  const response = await apiClient<PredictionHistoryItem[]>(
    withMockError(
      `/shipments/${id}/predictions?page=${page}&page_size=${pageSize}`,
      mockError,
    ),
  );
  return {
    history: response.data,
    pagination:
      response.meta.pagination ?? { page, page_size: pageSize, total: 0 },
  };
}

export async function fetchPrediction(
  shipmentId: string,
  predictionId: string,
  mockError?: string,
): Promise<Prediction> {
  const response = await apiClient<Prediction>(
    withMockError(
      `/shipments/${shipmentId}/predictions/${predictionId}`,
      mockError,
    ),
  );
  return response.data;
}

export async function runPrediction(
  shipmentId: string,
  idempotencyKey: string,
  runMockError?: string,
): Promise<Prediction> {
  const response = await apiClient<Prediction>(
    withMockParam(
      `/shipments/${shipmentId}/prediction`,
      runMockError,
      "mock_run_error",
    ),
    {
      method: "POST",
      idempotencyKey,
    },
  );
  return response.data;
}
