import { z } from "zod";
import type { TariffRuleCreate } from "../api/types";
import {
  CARGO_TYPE_OPTIONS,
  CONTAINER_SIZE_OPTIONS,
  SHIPPING_LINE_OPTIONS,
} from "../shipments/options";
import { RATE_TYPE_OPTIONS, RULE_TYPE_OPTIONS } from "./options";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RATE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const HS_PREFIX_PATTERN = /^\d{2,6}$/;
const OPTIONAL_ENUM = (values: readonly string[], message: string) =>
  z
    .string()
    .refine((value) => value === "" || values.includes(value), message);

export const tariffFormSchema = z
  .object({
    rule_type: z.enum(RULE_TYPE_OPTIONS, {
      errorMap: () => ({ message: "Select a rule type." }),
    }),
    rate_type: z.enum(RATE_TYPE_OPTIONS, {
      errorMap: () => ({ message: "Select a rate type." }),
    }),
    port_id: z.string(),
    hs_code_prefix: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || HS_PREFIX_PATTERN.test(value),
        "Enter 2 to 6 digits.",
      ),
    shipping_line: OPTIONAL_ENUM(
      SHIPPING_LINE_OPTIONS,
      "Select a shipping line.",
    ),
    cargo_type: OPTIONAL_ENUM(CARGO_TYPE_OPTIONS, "Select a cargo type."),
    container_size_ft: OPTIONAL_ENUM(
      CONTAINER_SIZE_OPTIONS,
      "Select a container size.",
    ),
    rate_value: z
      .string({ required_error: "Enter the rate value." })
      .trim()
      .min(1, "Enter the rate value.")
      .regex(RATE_PATTERN, "Enter a non-negative amount with up to 2 decimals."),
    currency: z.literal("INR"),
    free_days: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^(0|[1-9]\d*)$/.test(value),
        "Enter a whole number of days.",
      ),
    valid_from: z
      .string({ required_error: "Select a start date." })
      .regex(DATE_PATTERN, "Select a start date."),
    valid_to: z.string().refine((value) => value === "" || DATE_PATTERN.test(value), "Select an end date."),
    source_note: z
      .string({ required_error: "Enter a source note." })
      .trim()
      .min(1, "A source note is required."),
    version: z
      .string({ required_error: "Enter a version." })
      .trim()
      .min(1, "Enter a version."),
    tier_config: z.string(),
  })
  .superRefine((values, ctx) => {
    if (
      values.valid_to !== "" &&
      values.valid_from !== "" &&
      values.valid_to <= values.valid_from
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valid_to"],
        message: "Must be after the start date.",
      });
    }

    if (values.rate_type !== "tiered") {
      return;
    }

    if (!values.tier_config.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tier_config"],
        message: "Tiered rates need a tiers JSON object.",
      });
      return;
    }

    try {
      const parsed: unknown = JSON.parse(values.tier_config);

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tier_config"],
        message: "Enter a valid JSON object.",
      });
    }
  });

export type TariffFormValues = z.input<typeof tariffFormSchema>;

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toTariffCreate(values: TariffFormValues): TariffRuleCreate {
  const freeDays = values.free_days.trim();

  return {
    rule_type: values.rule_type,
    port_id: optional(values.port_id),
    hs_code_prefix: optional(values.hs_code_prefix),
    shipping_line: (optional(values.shipping_line) ?? null) as TariffRuleCreate["shipping_line"],
    cargo_type: (optional(values.cargo_type) ?? null) as TariffRuleCreate["cargo_type"],
    container_size_ft: values.container_size_ft === ""
      ? null
      : values.container_size_ft === "20"
        ? 20
        : 40,
    rate_type: values.rate_type,
    rate_value: values.rate_value.trim(),
    currency: "INR",
    free_days: freeDays === "" ? null : Number(freeDays),
    tier_config:
      values.rate_type === "tiered" && values.tier_config.trim()
        ? JSON.parse(values.tier_config)
        : null,
    valid_from: `${values.valid_from}T00:00:00Z`,
    valid_to: values.valid_to === "" ? null : `${values.valid_to}T00:00:00Z`,
    source_note: values.source_note.trim(),
    version: values.version.trim(),
  };
}
