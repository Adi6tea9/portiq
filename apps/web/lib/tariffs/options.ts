import type { CostComponent, RateType } from "../api/types";

export const RULE_TYPE_OPTIONS = [
  "customs_duty",
  "port_storage",
  "demurrage",
  "other_charge",
] as const satisfies readonly CostComponent[];

export const RATE_TYPE_OPTIONS = [
  "per_day",
  "percent_of_value",
  "flat",
  "tiered",
] as const satisfies readonly RateType[];
