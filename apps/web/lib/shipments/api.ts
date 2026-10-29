import { apiClient } from "../api/client";
import type {
  Pagination,
  Port,
  Shipment,
  ShipmentCreate,
} from "../api/types";
import { buildShipmentListQuery, type ShipmentListQuery } from "./query";

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
