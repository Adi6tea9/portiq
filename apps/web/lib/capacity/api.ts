import { apiClient } from "../api/client";
import type { CapacityBucket, Pagination, ResourceType } from "../api/types";

const PAGE_SIZE = 100;

export interface CapacityForecastRequest {
  portId: string;
  resourceType: ResourceType;
  /** Inclusive start date, `YYYY-MM-DD`. */
  from: string;
  /** Exclusive end date, `YYYY-MM-DD`. */
  to: string;
  mockEmpty?: boolean;
  mockInvalid?: boolean;
  /** Mock-only failure code for this endpoint, e.g. `503`. */
  mockCapacityError?: string;
}

export interface CapacityForecastResult {
  buckets: CapacityBucket[];
  pagination: Pagination;
}

export function buildCapacityForecastQuery(
  request: CapacityForecastRequest,
): string {
  const params = new URLSearchParams({
    port_id: request.portId,
    resource_type: request.resourceType,
    from: request.from,
    to: request.to,
    page: "1",
    page_size: String(PAGE_SIZE),
  });

  if (request.mockEmpty) {
    params.set("mock_empty", "1");
  }

  if (request.mockInvalid) {
    params.set("mock_invalid", "1");
  }

  if (request.mockCapacityError) {
    params.set("mock_capacity_error", request.mockCapacityError);
  }

  return params.toString();
}

export async function fetchCapacityForecast(
  request: CapacityForecastRequest,
): Promise<CapacityForecastResult> {
  const query = buildCapacityForecastQuery(request);
  const response = await apiClient<CapacityBucket[]>(
    `/capacity/forecast?${query}`,
  );

  return {
    buckets: response.data,
    pagination:
      response.meta.pagination ?? {
        page: 1,
        page_size: response.data.length,
        total: response.data.length,
      },
  };
}
