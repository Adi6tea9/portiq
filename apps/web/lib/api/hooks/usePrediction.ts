"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPrediction } from "@/lib/shipments/api";
import type { Prediction } from "@/lib/api/types";
import type { ApiError } from "../client";

export interface UsePredictionOptions {
  shipmentId: string;
  predictionId: string;
  mockError?: string;
}

export function usePrediction({
  shipmentId,
  predictionId,
  mockError,
}: UsePredictionOptions) {
  return useQuery<Prediction, ApiError>({
    queryKey: [
      "shipment",
      shipmentId,
      "prediction",
      predictionId,
      mockError ?? null,
    ],
    queryFn: () => fetchPrediction(shipmentId, predictionId, mockError),
    enabled: !!shipmentId && !!predictionId,
  });
}