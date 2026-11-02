"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchOperatorShipments,
  type OperatorShipmentRequest,
  type OperatorShipmentResult,
} from "@/lib/operator/api";
import type { ApiError } from "../client";

export function useOperatorShipments(params: OperatorShipmentRequest) {
  return useQuery<OperatorShipmentResult, ApiError>({
    queryKey: ["operator", "shipments", params],
    queryFn: () => fetchOperatorShipments(params),
    placeholderData: keepPreviousData,
  });
}
