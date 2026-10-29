import type {
  Prediction,
  PredictionHistoryItem,
  Warning,
} from "../../api/types";

const demoWarning: Warning = {
  code: "DEMO_DATA",
  message:
    "This prediction uses synthetic demo data. Do not use it for operational decisions.",
};

const provenance = (
  tariffRuleVersions: string[],
  generatedAt: string,
): Prediction["provenance"] => ({
  model_version: "demo-model-0.8.2",
  dataset_version: "2026-10-15",
  tariff_rule_versions: tariffRuleVersions,
  generated_at: generatedAt,
  data_source: "synthetic",
  is_demo_data: true,
});

export const mockPredictionFull: Prediction = {
  prediction_id: "pred_001",
  shipment_id: "ship_001",
  predicted_dwell_days: 6.2,
  predicted_clearance_at: "2026-11-11T14:42:00Z",
  currency: "INR",
  cost_breakdown: [
    {
      component: "customs_duty",
      amount: "250000.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v2.3",
    },
    {
      component: "port_storage",
      amount: "18500.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.8",
    },
    {
      component: "demurrage",
      amount: "12000.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.5",
    },
    {
      component: "other_charge",
      amount: "5200.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.2",
    },
  ],
  total_estimated_cost: "285700.00",
  total_is_partial: false,
  capacity_snapshot: {
    status: "available",
    reason: null,
    resource_type: "yard",
    utilization_pct: 72,
    source_type: "synthetic",
    bucket_start: "2026-11-05T00:00:00Z",
    bucket_end: "2026-11-06T00:00:00Z",
  },
  explanation: {
    status: "available",
    reason: null,
    method: "SHAP",
    base_value_days: 5.0,
    unit: "days",
    features: [
      { name: "documentation_status", value: "complete", contribution: -0.8 },
      { name: "vessel_size_band", value: "large", contribution: 0.5 },
      { name: "cargo_type", value: "general_container", contribution: -0.2 },
      { name: "shipping_line", value: "Line A", contribution: 0.3 },
      { name: "weight_kg", value: 18000, contribution: 0.4 },
      { name: "hs_code_category", value: "85", contribution: 1.0 },
    ],
  },
  warnings: [demoWarning],
  provenance: provenance(
    ["tariff-v2.3", "tariff-v1.8", "tariff-v1.5", "tariff-v1.2"],
    "2026-10-28T14:30:00Z",
  ),
};

export const mockPredictionPartial: Prediction = {
  prediction_id: "pred_002",
  shipment_id: "ship_002",
  predicted_dwell_days: 9.4,
  predicted_clearance_at: "2026-11-17T15:36:00Z",
  currency: "INR",
  cost_breakdown: [
    {
      component: "customs_duty",
      amount: "75000.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v2.3",
    },
    {
      component: "port_storage",
      amount: "14200.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.8",
    },
    {
      component: "demurrage",
      amount: null,
      status: "unavailable",
      reason:
        "No demurrage rule found for shipping line Line B and cargo type reefer.",
      rule_version: null,
    },
    {
      component: "other_charge",
      amount: "3800.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.2",
    },
  ],
  total_estimated_cost: "93000.00",
  total_is_partial: true,
  capacity_snapshot: {
    status: "available",
    reason: null,
    resource_type: "yard",
    utilization_pct: 85,
    source_type: "synthetic",
    bucket_start: "2026-11-08T00:00:00Z",
    bucket_end: "2026-11-09T00:00:00Z",
  },
  explanation: {
    status: "available",
    reason: null,
    method: "SHAP",
    base_value_days: 6.5,
    unit: "days",
    features: [
      { name: "documentation_status", value: "incomplete", contribution: 2.8 },
      { name: "vessel_size_band", value: "medium", contribution: 0.3 },
      { name: "cargo_type", value: "reefer", contribution: 0.6 },
      { name: "shipping_line", value: "Line B", contribution: -0.2 },
      { name: "weight_kg", value: 8500, contribution: -0.6 },
    ],
  },
  warnings: [
    demoWarning,
    {
      code: "TARIFF_MISSING",
      message:
        "One applicable tariff rule could not be resolved. The total cost is incomplete.",
    },
  ],
  provenance: provenance(
    ["tariff-v2.3", "tariff-v1.8", "tariff-v1.2"],
    "2026-10-28T16:15:00Z",
  ),
};

export const mockPredictionNoExplanation: Prediction = {
  prediction_id: "pred_003",
  shipment_id: "ship_003",
  predicted_dwell_days: 5.8,
  predicted_clearance_at: "2026-11-05T03:12:00Z",
  currency: "INR",
  cost_breakdown: [
    {
      component: "customs_duty",
      amount: "180000.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v2.3",
    },
    {
      component: "port_storage",
      amount: "16800.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.8",
    },
    {
      component: "demurrage",
      amount: "10500.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.5",
    },
    {
      component: "other_charge",
      amount: "4500.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.2",
    },
  ],
  total_estimated_cost: "211800.00",
  total_is_partial: false,
  capacity_snapshot: {
    status: "available",
    reason: null,
    resource_type: "yard",
    utilization_pct: 68,
    source_type: "synthetic",
    bucket_start: "2026-10-30T00:00:00Z",
    bucket_end: "2026-10-31T00:00:00Z",
  },
  explanation: {
    status: "unavailable",
    reason:
      "The SHAP explainer is unavailable for this prediction because of a model version mismatch.",
    features: [],
  },
  warnings: [
    demoWarning,
    {
      code: "EXPLANATION_UNAVAILABLE",
      message:
        "Feature importance could not be generated for this prediction.",
    },
  ],
  provenance: provenance(
    ["tariff-v2.3", "tariff-v1.8", "tariff-v1.5", "tariff-v1.2"],
    "2026-10-28T10:45:00Z",
  ),
};

export const mockPredictionNoCapacity: Prediction = {
  prediction_id: "pred_007",
  shipment_id: "ship_007",
  predicted_dwell_days: 5.1,
  predicted_clearance_at: "2026-11-08T08:39:00Z",
  currency: "INR",
  cost_breakdown: [
    {
      component: "customs_duty",
      amount: "58000.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v2.3",
    },
    {
      component: "port_storage",
      amount: "12400.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.8",
    },
    {
      component: "demurrage",
      amount: "8200.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.5",
    },
    {
      component: "other_charge",
      amount: "3100.00",
      status: "estimated",
      reason: null,
      rule_version: "tariff-v1.2",
    },
  ],
  total_estimated_cost: "81700.00",
  total_is_partial: false,
  capacity_snapshot: {
    status: "unavailable",
    reason:
      "Capacity forecast is not available for the requested arrival date range.",
    resource_type: null,
    utilization_pct: null,
    source_type: null,
    bucket_start: null,
    bucket_end: null,
  },
  explanation: {
    status: "available",
    reason: null,
    method: "SHAP",
    base_value_days: 5.5,
    unit: "days",
    features: [
      { name: "documentation_status", value: "complete", contribution: -0.6 },
      { name: "vessel_size_band", value: "small", contribution: -0.3 },
      { name: "cargo_type", value: "general_container", contribution: -0.2 },
      { name: "shipping_line", value: "Line B", contribution: 0.4 },
      { name: "weight_kg", value: 6800, contribution: 0.3 },
    ],
  },
  warnings: [
    demoWarning,
    {
      code: "CAPACITY_UNAVAILABLE",
      message:
        "The port capacity snapshot could not be retrieved for the arrival window.",
    },
  ],
  provenance: provenance(
    ["tariff-v2.3", "tariff-v1.8", "tariff-v1.5", "tariff-v1.2"],
    "2026-10-28T12:20:00Z",
  ),
};

export const mockPredictionAllUnavailable: Prediction = {
  prediction_id: "pred_012",
  shipment_id: "ship_012",
  predicted_dwell_days: 7.4,
  predicted_clearance_at: "2026-11-22T15:30:00Z",
  currency: "INR",
  cost_breakdown: [
    {
      component: "customs_duty",
      amount: null,
      status: "unavailable",
      reason: "No active customs duty rule matches this shipment.",
      rule_version: null,
    },
    {
      component: "port_storage",
      amount: null,
      status: "unavailable",
      reason: "No active port storage rule matches this shipment.",
      rule_version: null,
    },
    {
      component: "demurrage",
      amount: null,
      status: "unavailable",
      reason: "No active demurrage rule matches this shipment.",
      rule_version: null,
    },
    {
      component: "other_charge",
      amount: null,
      status: "unavailable",
      reason: "No active other charge rule matches this shipment.",
      rule_version: null,
    },
  ],
  total_estimated_cost: null,
  total_is_partial: true,
  capacity_snapshot: {
    status: "unavailable",
    reason:
      "Capacity forecast is not available for the requested arrival date range.",
    resource_type: null,
    utilization_pct: null,
    source_type: null,
    bucket_start: null,
    bucket_end: null,
  },
  explanation: {
    status: "unavailable",
    reason: "Feature importance could not be generated for this prediction.",
    features: [],
  },
  warnings: [
    demoWarning,
    {
      code: "TARIFF_MISSING",
      message:
        "No applicable tariff rules were resolved. The total cost is unavailable.",
    },
    {
      code: "CAPACITY_UNAVAILABLE",
      message:
        "The port capacity snapshot could not be retrieved for the arrival window.",
    },
    {
      code: "EXPLANATION_UNAVAILABLE",
      message:
        "Feature importance could not be generated for this prediction.",
    },
  ],
  provenance: provenance([], "2026-10-28T18:05:00Z"),
};

export const mockPredictions: Record<string, Prediction> = {
  pred_001: mockPredictionFull,
  pred_002: mockPredictionPartial,
  pred_003: mockPredictionNoExplanation,
  pred_007: mockPredictionNoCapacity,
  pred_012: mockPredictionAllUnavailable,
};

export const mockPredictionHistory: PredictionHistoryItem[] = Object.values(
  mockPredictions,
).map((prediction) => ({
  prediction_id: prediction.prediction_id,
  created_at: prediction.provenance.generated_at,
  model_version: prediction.provenance.model_version,
  predicted_dwell_days: prediction.predicted_dwell_days,
  total_estimated_cost: prediction.total_estimated_cost,
  total_is_partial: prediction.total_is_partial,
  is_demo_data: prediction.provenance.is_demo_data,
}));
