"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPorts } from "@/lib/shipments/api";
import type { ApiError } from "../client";
import type { Port } from "../types";

export function usePorts() {
  return useQuery<Port[], ApiError>({
    queryKey: ["ports"],
    queryFn: () => fetchPorts(),
    staleTime: 5 * 60_000,
  });
}
