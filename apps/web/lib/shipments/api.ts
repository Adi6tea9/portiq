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
} from "../api/types";
import { buildShipmentListQuery, type ShipmentListQuery } from "./query";

export type { ShipmentDetail, PredictionHistoryItem };

export interface ShipmentListRequest extends ShipmentListQuery {
  mockError?: string;
}

export interface ShipmentListResult {
  shipments: Shipment[];
  pagination: Pagination;
}

function withMockError(path: string, mockError?: string): string {
  if (!mockError) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}mock_error=${encodeURIComponent(mockError)}`;
}

export async function fetchPorts(mockError?: string): Promise<Port[]> {
  const response = await apiClient<Port[]>(withMockError("/ports", mockError));
  return response.data;
}

export async function fetchShipments(
  request: ShipmentListRequest,
): Promise<ShipmentListResult> {
  const query = buildShipmentListQuery(request);
  const response = await apiClient<Shipment[]>(
    withMockError(`/shipments?${query}`, request.mockError),
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
  mockError?: string,
): Promise<ShipmentDetail> {
  const response = await apiClient<ShipmentDetail>(
    withMockError(`/shipments/${id}/events`, mockError),
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
  mockError?: string,
): Promise<Prediction> {
  const response = await apiClient<Prediction>(
    withMockError(`/shipments/${shipmentId}/prediction`, mockError),
    {
      method: "POST",
      idempotencyKey,
    },
  );
  return response.data;
}
