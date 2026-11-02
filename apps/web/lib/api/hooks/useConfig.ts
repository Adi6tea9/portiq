"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { AppConfig } from "@/lib/api/types";
import type { ApiError } from "../client";

export function useConfig() {
  return useQuery<AppConfig, ApiError>({
    queryKey: ["config"],
    queryFn: async () => {
      const response = await apiClient<AppConfig>("/config");
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}