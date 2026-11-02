import type {
  AtRiskItem,
  DwellBin,
  OperatorOverview,
  OperatorShipmentRow,
  ShipmentStatus,
} from "../../api/types";
import { mockBerthCapacity, mockYardCapacity } from "./capacity";
import { mockPorts } from "./ports";
import { mockShipments } from "./shipments";

const DAY_MS = 24 * 60 * 60 * 1000;

function todayStartIso(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
}

const STATUSES: readonly ShipmentStatus[] = [
  "submitted",
  "arrived",
  "cleared",
];

function atRiskReasons(index: number): AtRiskItem["reasons"] {
  if (index === 0) {
    return [
      {
        code: "FORECAST_THRESHOLD_CROSSED",
        message: "Forecast utilization is above the high threshold.",
      },
      {
        code: "DWELL_ABOVE_THRESHOLD",
        message: "Predicted dwell is above the planning threshold.",
      },
    ];
  }

  if (index === 1) {
    return [
      {
        code: "DOCUMENTATION_INCOMPLETE",
        message: "Documentation is incomplete.",
      },
    ];
  }

  return [];
}

export const mockOperatorRows: OperatorShipmentRow[] = Array.from(
  { length: 40 },
  (_, index) => {
    const base = mockShipments[index % mockShipments.length];
    const number = String(index + 1).padStart(3, "0");
    const arrivalDay = new Date(
      Date.parse(todayStartIso()) + (index - 5) * DAY_MS,
    )
      .toISOString()
      .slice(0, 10);

    return {
      shipment: {
        ...base,
        id: `ops_ship_${number}`,
        reference: `OPS-2026-${number}`,
        port_id: index % 2 === 0 ? "port_nsa" : "port_sin",
        expected_arrival_at: `${arrivalDay}T08:00:00Z`,
      },
      at_risk_reasons: index < 3 ? atRiskReasons(index) : [],
      warning_codes:
        index === 1
          ? ["TARIFF_MISSING"]
          : index === 2
            ? ["CAPACITY_UNAVAILABLE"]
            : [],
    };
  },
);

const statusCounts = STATUSES.reduce<Record<ShipmentStatus, number>>(
  (counts, status) => {
    counts[status] = mockOperatorRows.filter(
      (row) => row.shipment.status === status,
    ).length;
    return counts;
  },
  { submitted: 0, arrived: 0, cleared: 0 },
);

const dwellDistribution: DwellBin[] = [
  { bin_start_days: 0, bin_end_days: 2, count: 4 },
  { bin_start_days: 2, bin_end_days: 4, count: 9 },
  { bin_start_days: 4, bin_end_days: 6, count: 12 },
  { bin_start_days: 6, bin_end_days: 8, count: 8 },
  { bin_start_days: 8, bin_end_days: 10, count: 5 },
  { bin_start_days: 10, bin_end_days: 14, count: 2 },
];

export const mockOperatorOverview: OperatorOverview = {
  port_scope: mockPorts.map((port) => ({ id: port.id, name: port.name })),
  range: {
    from: todayStartIso(),
    to: new Date(Date.parse(todayStartIso()) + 30 * DAY_MS).toISOString(),
  },
  status_counts: statusCounts,
  utilization: {
    yard: mockYardCapacity.slice(0, 30),
    berth: mockBerthCapacity.slice(0, 30),
  },
  at_risk_count: 3,
  at_risk: mockOperatorRows.slice(0, 3).map((row) => ({
    shipment_id: row.shipment.id,
    reference: row.shipment.reference,
    reasons: row.at_risk_reasons,
  })),
  dwell_distribution: dwellDistribution,
};
