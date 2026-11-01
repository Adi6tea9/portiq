"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchShipmentDetail,
  fetchPredictionHistory,
  type ShipmentDetail,
  type PredictionHistoryItem,
} from "@/lib/shipments/api";
import type { ApiError } from "../client";
import type { Pagination } from "@/lib/api/types";

export interface UseShipmentDetailOptions {
  id: string;
  mockError?: string;
}

export function useShipmentDetail({ id, mockError }: UseShipmentDetailOptions) {
  return useQuery<ShipmentDetail, ApiError>({
    queryKey: ["shipment", id, mockError ?? null],
    queryFn: () => fetchShipmentDetail(id, mockError),
    enabled: !!id,
  });
}

export interface UsePredictionHistoryOptions {
  shipmentId: string;
  page?: number;
  pageSize?: number;
  mockError?: string;
}

export function usePredictionHistory({
  shipmentId,
  page = 1,
  pageSize = 20,
  mockError,
}: UsePredictionHistoryOptions) {
  return useQuery<
    { history: PredictionHistoryItem[]; pagination: Pagination },
    ApiError
  >({
    queryKey: ["shipment", shipmentId, "predictions", page, pageSize, mockError ?? null],
    queryFn: () => fetchPredictionHistory(shipmentId, page, pageSize, mockError),
    enabled: !!shipmentId,
  });
}