"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchOperatorOverview,
  type OperatorOverviewRequest,
} from "@/lib/operator/api";
import type { OperatorOverview } from "@/lib/api/types";
import type { ApiError } from "../client";

export interface UseOperatorOverviewOptions extends OperatorOverviewRequest {
  enabled?: boolean;
}

export function useOperatorOverview({
  enabled = true,
  ...request
}: UseOperatorOverviewOptions) {
  return useQuery<OperatorOverview, ApiError>({
    queryKey: ["operator", "overview", request],
    queryFn: () => fetchOperatorOverview(request),
    enabled: enabled && !!request.from && !!request.to,
  });
}
