import { apiClient } from "../api/client";
import type {
  OperatorOverview,
  OperatorShipmentRow,
  Pagination,
  ShipmentStatus,
  WarningCode,
} from "../api/types";

export const OPERATOR_PAGE_SIZE = 10;

export interface OperatorOverviewRequest {
  /** Inclusive start date, `YYYY-MM-DD`. */
  from: string;
  /** Exclusive end date, `YYYY-MM-DD`. */
  to: string;
  portId?: string;
}

export interface OperatorShipmentRequest {
  status?: ShipmentStatus;
  arrivalFrom?: string;
  arrivalTo?: string;
  minPredictedDwellDays?: string;
  warningCode?: WarningCode;
  page: number;
  pageSize: number;
}

export interface OperatorShipmentResult {
  rows: OperatorShipmentRow[];
  pagination: Pagination;
}

function dateBoundary(value: string, endOfDay: boolean): string {
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}

export function buildOperatorOverviewQuery(
  request: OperatorOverviewRequest,
): string {
  const params = new URLSearchParams({
    from: request.from,
    to: request.to,
  });

  if (request.portId) {
    params.set("port_id", request.portId);
  }

  return params.toString();
}

export function buildOperatorShipmentsQuery(
  request: OperatorShipmentRequest,
): string {
  const params = new URLSearchParams();

  if (request.status) {
    params.set("status", request.status);
  }

  if (request.arrivalFrom) {
    params.set("arrival_from", dateBoundary(request.arrivalFrom, false));
  }

  if (request.arrivalTo) {
    params.set("arrival_to", dateBoundary(request.arrivalTo, true));
  }

  const minDwell = request.minPredictedDwellDays?.trim();

  if (minDwell) {
    params.set("min_predicted_dwell_days", minDwell);
  }

  if (request.warningCode) {
    params.set("warning_code", request.warningCode);
  }

  params.set("page", String(Math.max(1, Math.floor(request.page))));
  params.set("page_size", String(Math.max(1, Math.floor(request.pageSize))));

  return params.toString();
}

export async function fetchOperatorOverview(
  request: OperatorOverviewRequest,
): Promise<OperatorOverview> {
  const response = await apiClient<OperatorOverview>(
    `/operator/overview?${buildOperatorOverviewQuery(request)}`,
  );

  return response.data;
}

export async function fetchOperatorShipments(
  request: OperatorShipmentRequest,
): Promise<OperatorShipmentResult> {
  const query = buildOperatorShipmentsQuery(request);
  const response = await apiClient<OperatorShipmentRow[]>(
    `/operator/shipments?${query}`,
  );

  return {
    rows: response.data,
    pagination:
      response.meta.pagination ?? {
        page: request.page,
        page_size: request.pageSize,
        total: response.data.length,
      },
  };
}
