"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchTariffs,
  type TariffListRequest,
  type TariffListResult,
} from "@/lib/tariffs/api";
import type { ApiError } from "../client";

export function useTariffs(params: TariffListRequest) {
  return useQuery<TariffListResult, ApiError>({
    queryKey: ["tariffs", params],
    queryFn: () => fetchTariffs(params),
    placeholderData: keepPreviousData,
  });
}
