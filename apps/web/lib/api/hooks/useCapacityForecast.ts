"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchCapacityForecast,
  type CapacityForecastRequest,
  type CapacityForecastResult,
} from "@/lib/capacity/api";
import type { ApiError } from "../client";

export interface UseCapacityForecastOptions extends CapacityForecastRequest {
  enabled?: boolean;
}

export function useCapacityForecast({
  enabled = true,
  ...request
}: UseCapacityForecastOptions) {
  return useQuery<CapacityForecastResult, ApiError>({
    queryKey: ["capacity", request],
    queryFn: () => fetchCapacityForecast(request),
    enabled: enabled && !!request.portId && !!request.from && !!request.to,
  });
}
