import { apiClient } from "../api/client";
import type {
  AuditLogItem,
  Pagination,
  TariffRule,
  TariffRuleCreate,
} from "../api/types";

export interface TariffListRequest {
  ruleType?: string;
  portId?: string;
  hsCodePrefix?: string;
  shippingLine?: string;
  isActive?: string;
  validOn?: string;
  page: number;
  pageSize: number;
}

export interface TariffListResult {
  rules: TariffRule[];
  pagination: Pagination;
}

export interface AuditLogListRequest {
  page: number;
  pageSize: number;
}

export interface AuditLogListResult {
  logs: AuditLogItem[];
  pagination: Pagination;
}

export function buildTariffListQuery(request: TariffListRequest): string {
  const params = new URLSearchParams();

  if (request.ruleType) {
    params.set("rule_type", request.ruleType);
  }
  if (request.portId) {
    params.set("port_id", request.portId);
  }
  if (request.hsCodePrefix) {
    params.set("hs_code_prefix", request.hsCodePrefix);
  }
  if (request.shippingLine) {
    params.set("shipping_line", request.shippingLine);
  }
  if (request.isActive) {
    params.set("is_active", request.isActive);
  }
  if (request.validOn) {
    params.set("valid_on", request.validOn);
  }

  params.set("page", String(Math.max(1, Math.floor(request.page))));
  params.set("page_size", String(Math.max(1, Math.floor(request.pageSize))));

  return params.toString();
}

export async function fetchTariffs(
  request: TariffListRequest,
): Promise<TariffListResult> {
  const response = await apiClient<TariffRule[]>(
    `/admin/tariffs?${buildTariffListQuery(request)}`,
  );

  return {
    rules: response.data,
    pagination:
      response.meta.pagination ?? {
        page: request.page,
        page_size: request.pageSize,
        total: response.data.length,
      },
  };
}

export async function createTariff(
  payload: TariffRuleCreate,
): Promise<TariffRule> {
  const response = await apiClient<TariffRule>("/admin/tariffs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function deactivateTariff(ruleId: string): Promise<TariffRule> {
  const response = await apiClient<TariffRule>(`/admin/tariffs/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false }),
  });
  return response.data;
}

export async function fetchAuditLogs(
  request: AuditLogListRequest,
): Promise<AuditLogListResult> {
  const response = await apiClient<AuditLogItem[]>(
    `/admin/audit-logs?page=${request.page}&page_size=${request.pageSize}`,
  );

  return {
    logs: response.data,
    pagination:
      response.meta.pagination ?? {
        page: request.page,
        page_size: request.pageSize,
        total: response.data.length,
      },
  };
}
