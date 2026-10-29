export type Role = "importer_exporter" | "port_operator" | "platform_admin";
export type Direction = "import" | "export";
export type CargoType = "general_container" | "reefer" | "hazardous" | "oversized";
export type ContainerSizeFt = 20 | 40;
export type ShippingLine = "Line A" | "Line B" | "Line C" | "Line D" | "other";
export type VesselSizeBand = "small" | "medium" | "large";
export type DocumentationStatus = "complete" | "incomplete" | "unknown";
export type ShipmentStatus = "submitted" | "arrived" | "cleared";
export type ResourceType = "yard" | "berth";
export type SourceType = "synthetic" | "imported";
export type Currency = "INR";
export type CostComponent = "customs_duty" | "port_storage" | "demurrage" | "other_charge";
export type RateType = "per_day" | "percent_of_value" | "flat" | "tiered";
export type WarningCode = "DEMO_DATA" | "CAPACITY_UNAVAILABLE" | "EXPLANATION_UNAVAILABLE"
  | "TARIFF_MISSING" | "OUT_OF_RANGE_INPUT";
export type AtRiskCode = "FORECAST_THRESHOLD_CROSSED" | "DWELL_ABOVE_THRESHOLD" | "DOCUMENTATION_INCOMPLETE";

export interface Pagination { page: number; page_size: number; total: number }
export interface Meta { request_id: string; generated_at?: string; pagination?: Pagination }
export interface Envelope<T> { data: T; meta: Meta }
export interface ApiErrorBody { error: { code: string; message: string;
  details?: { field: string; issue: string }[]; request_id: string } }
export interface Warning { code: WarningCode; message: string }

export interface Me { user_id: string; email: string; display_name: string | null;
  role: Role; assigned_port_ids: string[] }
export interface AppConfig { capacity_thresholds: { moderate_pct: number; high_pct: number };
  max_forecast_range_days: number; default_bucket: "day" }
export interface Port { id: string; name: string; port_code: string; timezone: string }

export interface LatestPredictionSummary { prediction_id: string; created_at: string;
  predicted_dwell_days: number; total_estimated_cost: string | null;
  total_is_partial: boolean; model_version: string; is_demo_data: boolean }
export interface Shipment { id: string; port_id: string; reference: string; direction: Direction;
  cargo_type: CargoType; container_size_ft: ContainerSizeFt; hs_code: string; weight_kg: number;
  declared_value: string; currency: Currency; shipping_line: ShippingLine;
  vessel_size_band: VesselSizeBand; expected_arrival_at: string;
  documentation_status: DocumentationStatus; status: ShipmentStatus;
  actual_arrival_at: string | null; actual_cleared_at: string | null;
  actual_dwell_days: number | null; created_at: string; updated_at: string;
  latest_prediction: LatestPredictionSummary | null }
export interface ShipmentCreate { port_id: string; reference: string; direction: Direction;
  cargo_type: CargoType; container_size_ft: ContainerSizeFt; hs_code: string; weight_kg: number;
  declared_value: string; currency: Currency; shipping_line: ShippingLine;
  vessel_size_band: VesselSizeBand; expected_arrival_at: string;
  documentation_status: DocumentationStatus }
// Editable before status "arrived" (allowlist). Never status, owner or port.
export type ShipmentPatch = Partial<Pick<ShipmentCreate, "cargo_type" | "container_size_ft"
  | "hs_code" | "weight_kg" | "declared_value" | "shipping_line" | "vessel_size_band"
  | "expected_arrival_at" | "documentation_status">>;
export interface ShipmentEvent { id: string; shipment_id: string; event_type: string;
  from_status: ShipmentStatus | null; to_status: ShipmentStatus; occurred_at: string;
  recorded_at: string; actor_display_name: string | null; note: string | null }
export interface ShipmentDetail extends Shipment { events: ShipmentEvent[] }
export interface EventCreate { to_status: ShipmentStatus; occurred_at: string; note?: string }
export interface ShipmentSummary { total: number; status_counts: Record<ShipmentStatus, number> }

export interface CostLine { component: CostComponent; amount: string | null;
  status: "estimated" | "unavailable"; reason: string | null; rule_version: string | null }
export interface CapacitySnapshot { status: "available" | "unavailable"; reason: string | null;
  resource_type?: ResourceType | null; utilization_pct?: number | null;
  source_type?: SourceType | null; bucket_start?: string | null; bucket_end?: string | null }
export interface ExplanationFeature { name: string; value: string | number; contribution: number }
export interface Explanation { status: "available" | "unavailable"; reason: string | null;
  method?: "SHAP"; base_value_days?: number; unit?: "days"; features: ExplanationFeature[] }
export interface Provenance { model_version: string; dataset_version: string;
  tariff_rule_versions: string[]; generated_at: string; data_source: SourceType;
  is_demo_data: boolean }
export interface Prediction { prediction_id: string; shipment_id: string;
  predicted_dwell_days: number; predicted_clearance_at: string; currency: Currency;
  cost_breakdown: CostLine[]; total_estimated_cost: string | null; total_is_partial: boolean;
  capacity_snapshot: CapacitySnapshot | null; explanation: Explanation | null;
  warnings: Warning[]; provenance: Provenance }
export interface PredictionHistoryItem { prediction_id: string; created_at: string;
  model_version: string; predicted_dwell_days: number; total_estimated_cost: string | null;
  total_is_partial: boolean; is_demo_data: boolean }

export interface CapacityBucket { bucket_start: string; bucket_end: string;
  resource_type: ResourceType; predicted_occupied: number; total_capacity: number;
  utilization_pct: number; source_type: SourceType; model_or_rule_version: string;
  generated_at: string }

export interface AtRiskItem { shipment_id: string; reference: string;
  reasons: { code: AtRiskCode; message: string }[] }
export interface DwellBin { bin_start_days: number; bin_end_days: number; count: number }
export interface OperatorOverview { port_scope: { id: string; name: string }[];
  range: { from: string; to: string }; status_counts: Record<ShipmentStatus, number>;
  utilization: { yard: CapacityBucket[]; berth: CapacityBucket[] };
  at_risk_count: number; at_risk: AtRiskItem[]; dwell_distribution: DwellBin[] }
export interface OperatorShipmentRow { shipment: Shipment; at_risk_reasons: AtRiskItem["reasons"];
  warning_codes: WarningCode[] }

export interface TariffRule { id: string; rule_type: CostComponent; port_id: string | null;
  hs_code_prefix: string | null; shipping_line: ShippingLine | null;
  cargo_type: CargoType | null; container_size_ft: ContainerSizeFt | null;
  rate_type: RateType; rate_value: string; currency: Currency; free_days: number | null;
  tier_config: unknown | null; valid_from: string; valid_to: string | null;
  source_note: string; version: string; is_active: boolean }
export type TariffRuleCreate = Omit<TariffRule, "id" | "is_active">;
export interface AuditLogItem { id: string; actor_display_name: string | null; action: string;
  entity_type: string; entity_id: string; before: unknown | null; after: unknown | null;
  created_at: string; request_id: string }
