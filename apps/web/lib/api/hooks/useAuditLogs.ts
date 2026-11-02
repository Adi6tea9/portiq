"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchAuditLogs,
  type AuditLogListRequest,
  type AuditLogListResult,
} from "@/lib/tariffs/api";
import type { ApiError } from "../client";

export function useAuditLogs(
  params: AuditLogListRequest,
  enabled = true,
) {
  return useQuery<AuditLogListResult, ApiError>({
    queryKey: ["audit-logs", params],
    queryFn: () => fetchAuditLogs(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}
