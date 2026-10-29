import type { ShipmentStatus } from "../api/types";

export const SHIPMENT_PAGE_SIZE = 10;

export interface ShipmentListQuery {
  status?: ShipmentStatus;
  arrivalFrom?: string;
  arrivalTo?: string;
  q?: string;
  page: number;
  pageSize: number;
}

function positiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function dateBoundary(value: string, endOfDay: boolean): string {
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}

export function buildShipmentListQuery(params: ShipmentListQuery): string {
  const search = new URLSearchParams();

  if (params.status) {
    search.set("status", params.status);
  }

  if (params.arrivalFrom) {
    search.set("arrival_from", dateBoundary(params.arrivalFrom, false));
  }

  if (params.arrivalTo) {
    search.set("arrival_to", dateBoundary(params.arrivalTo, true));
  }

  const query = params.q?.trim();

  if (query) {
    search.set("q", query);
  }

  const page = positiveInteger(params.page, 1);
  const pageSize = Math.min(100, positiveInteger(params.pageSize, 20));

  search.set("page", String(page));
  search.set("page_size", String(pageSize));

  return search.toString();
}
