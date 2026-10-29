import type { AuditLogItem } from "../../api/types";

const ACTIONS = [
  "shipment.created",
  "shipment.updated",
  "shipment.status_changed",
  "prediction.created",
  "tariff.created",
  "tariff.updated",
  "tariff.deactivated",
  "user.login",
] as const;

const ENTITY_TYPES = [
  "shipment",
  "shipment",
  "shipment",
  "prediction",
  "tariff_rule",
  "tariff_rule",
  "tariff_rule",
  "user",
] as const;

export const mockAuditLogs: AuditLogItem[] = Array.from(
  { length: 15 },
  (_, index) => {
    const action = ACTIONS[index % ACTIONS.length];
    const entityType = ENTITY_TYPES[index % ENTITY_TYPES.length];
    const number = String(index + 1).padStart(3, "0");
    const createdAt = new Date(
      Date.parse("2026-10-29T05:00:00Z") - index * 3 * 60 * 60 * 1000,
    ).toISOString();

    return {
      id: `audit_${number}`,
      actor_display_name:
        index % 3 === 0 ? "Demo Admin" : index % 3 === 1 ? "Demo Operator" : null,
      action,
      entity_type: entityType,
      entity_id:
        entityType === "tariff_rule"
          ? `rule_${String((index % 6) + 1).padStart(3, "0")}`
          : entityType === "shipment"
            ? `ship_${String((index % 12) + 1).padStart(3, "0")}`
            : entityType === "prediction"
              ? `pred_${String((index % 5) + 1).padStart(3, "0")}`
              : "user_imp_001",
      before:
        action.endsWith(".updated") || action.endsWith(".deactivated")
          ? { is_active: true }
          : null,
      after:
        action.endsWith(".updated") || action.endsWith(".deactivated")
          ? { is_active: false }
          : { recorded: true },
      created_at: createdAt,
      request_id: `req_audit_${number}`,
    };
  },
);
