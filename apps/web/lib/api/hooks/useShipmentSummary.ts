"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchShipmentSummary } from "@/lib/shipments/api";
import type { ShipmentSummary } from "@/lib/api/types";
import type { ApiError } from "../client";

export function useShipmentSummary(mockEmpty?: boolean) {
  return useQuery<ShipmentSummary, ApiError>({
    queryKey: ["shipments", "summary", mockEmpty ?? false],
    queryFn: () => fetchShipmentSummary(mockEmpty),
  });
}
