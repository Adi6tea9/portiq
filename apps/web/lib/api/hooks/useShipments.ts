"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchShipments,
  type ShipmentListRequest,
  type ShipmentListResult,
} from "@/lib/shipments/api";
import type { ApiError } from "../client";

export function useShipments(params: ShipmentListRequest) {
  return useQuery<ShipmentListResult, ApiError>({
    queryKey: [
      "shipments",
      params.status ?? null,
      params.arrivalFrom ?? null,
      params.arrivalTo ?? null,
      params.q ?? null,
      params.page,
      params.pageSize,
      params.mockError ?? null,
    ],
    queryFn: () => fetchShipments(params),
    placeholderData: keepPreviousData,
  });
}
