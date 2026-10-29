"use client";

import * as React from "react";
import { notFound } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  AuditLogItem,
  CapacityBucket,
  OperatorShipmentRow,
  Shipment,
  TariffRule,
} from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/Callout";
import { DataTable } from "@/components/shared/DataTable";
import { DateTime } from "@/components/shared/DateTime";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { Field } from "@/components/shared/Field";
import { Money } from "@/components/shared/Money";
import { PageState } from "@/components/shared/PageState";
import { Stat } from "@/components/shared/Stat";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  formatContainerSizeFt,
  formatDays,
  formatPercent,
  formatWeight,
} from "@/lib/format";
import { mockAuditLogs } from "@/lib/mocks/fixtures/audit";
import {
  mockBerthCapacity,
  mockEmptyCapacity,
  mockInvalidCapacity,
  mockYardCapacity,
} from "@/lib/mocks/fixtures/capacity";
import { mockErrorResponses } from "@/lib/mocks/fixtures/errors";
import { mockOperatorOverview, mockOperatorRows } from "@/lib/mocks/fixtures/operator";
import { mockPorts } from "@/lib/mocks/fixtures/ports";
import {
  mockPredictionAllUnavailable,
  mockPredictionFull,
  mockPredictionNoCapacity,
  mockPredictionNoExplanation,
  mockPredictionPartial,
} from "@/lib/mocks/fixtures/predictions";
import { mockShipments } from "@/lib/mocks/fixtures/shipments";
import { mockTariffs } from "@/lib/mocks/fixtures/tariffs";

const KOLKATA = "Asia/Kolkata";

const timezoneByPort = new Map(
  mockPorts.map((port) => [port.id, port.timezone]),
);

function portTimezone(portId: string): string {
  return timezoneByPort.get(portId) ?? KOLKATA;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-harbor-navy">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function CostTable({
  prediction,
}: {
  prediction: (typeof mockPredictionFull) | (typeof mockPredictionPartial) | (typeof mockPredictionNoExplanation) | (typeof mockPredictionNoCapacity) | (typeof mockPredictionAllUnavailable);
}) {
  return (
    <div className="w-full max-w-full overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Cost breakdown</caption>
        <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Component</th>
            <th scope="col" className="px-3 py-2 font-medium">Amount</th>
            <th scope="col" className="px-3 py-2 font-medium">Rule</th>
          </tr>
        </thead>
        <tbody>
          {prediction.cost_breakdown.map((line) => (
            <tr key={line.component} className="border-t border-border">
              <td className="px-3 py-2">{line.component}</td>
              <td className="px-3 py-2">
                <Money amount={line.amount} reason={line.reason} />
              </td>
              <td className="px-3 py-2 text-muted">
                {line.rule_version ?? "Unavailable"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SandboxPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [shipmentPage, setShipmentPage] = React.useState(1);
  const [operatorPage, setOperatorPage] = React.useState(1);
  const shipmentPageSize = 5;
  const operatorPageSize = 10;

  const shipmentColumns: ColumnDef<Shipment, unknown>[] = [
    { accessorKey: "reference", header: "Reference" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "arrival",
      header: "Expected arrival",
      cell: ({ row }) => (
        <DateTime
          isoTimestamp={row.original.expected_arrival_at}
          timezone={portTimezone(row.original.port_id)}
        />
      ),
    },
    {
      id: "dwell",
      header: "Predicted dwell",
      cell: ({ row }) =>
        row.original.latest_prediction
          ? formatDays(row.original.latest_prediction.predicted_dwell_days)
          : "Not predicted yet",
    },
    {
      id: "cost",
      header: "Estimated cost",
      cell: ({ row }) => (
        <Money
          amount={row.original.latest_prediction?.total_estimated_cost ?? null}
          reason={
            row.original.latest_prediction
              ? "A tariff rule is missing."
              : "No prediction yet."
          }
        />
      ),
    },
    {
      id: "size",
      header: "Container",
      cell: ({ row }) => formatContainerSizeFt(row.original.container_size_ft),
    },
    {
      id: "weight",
      header: "Weight",
      cell: ({ row }) => formatWeight(row.original.weight_kg),
    },
  ];

  const operatorColumns: ColumnDef<OperatorShipmentRow, unknown>[] = [
    {
      id: "reference",
      header: "Reference",
      cell: ({ row }) => row.original.shipment.reference,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.shipment.status} />,
    },
    {
      id: "dwell",
      header: "Predicted dwell",
      cell: ({ row }) =>
        row.original.shipment.latest_prediction
          ? formatDays(
              row.original.shipment.latest_prediction.predicted_dwell_days,
            )
          : "Not predicted yet",
    },
    {
      id: "reasons",
      header: "At-risk reasons",
      cell: ({ row }) =>
        row.original.at_risk_reasons.length > 0
          ? row.original.at_risk_reasons
              .map((reason) => reason.message)
              .join(" ")
          : "Reason unavailable",
    },
    {
      id: "warnings",
      header: "Warnings",
      cell: ({ row }) =>
        row.original.warning_codes.length > 0
          ? row.original.warning_codes.join(", ")
          : "None",
    },
  ];

  const tariffColumns: ColumnDef<TariffRule, unknown>[] = [
    { accessorKey: "rule_type", header: "Rule type" },
    {
      id: "port",
      header: "Port",
      cell: ({ row }) => row.original.port_id ?? "All ports",
    },
    {
      id: "rate",
      header: "Rate",
      cell: ({ row }) =>
        `${row.original.rate_type} · ${row.original.rate_value}`,
    },
    { accessorKey: "version", header: "Version" },
    {
      id: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline">
          <span className="text-text">
            {row.original.is_active ? "Active" : "Inactive"}
          </span>
        </Badge>
      ),
    },
  ];

  const auditColumns: ColumnDef<AuditLogItem, unknown>[] = [
    {
      id: "actor",
      header: "Actor",
      cell: ({ row }) => row.original.actor_display_name ?? "System",
    },
    { accessorKey: "action", header: "Action" },
    { accessorKey: "entity_type", header: "Entity" },
    {
      id: "when",
      header: "When",
      cell: ({ row }) => (
        <DateTime isoTimestamp={row.original.created_at} timezone={KOLKATA} />
      ),
    },
    {
      id: "request",
      header: "Request",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.request_id}</span>
      ),
    },
  ];

  const capacityColumns: ColumnDef<CapacityBucket, unknown>[] = [
    {
      id: "bucket",
      header: "Bucket start",
      cell: ({ row }) => (
        <DateTime isoTimestamp={row.original.bucket_start} timezone={KOLKATA} />
      ),
    },
    { accessorKey: "resource_type", header: "Resource" },
    { accessorKey: "predicted_occupied", header: "Occupied" },
    { accessorKey: "total_capacity", header: "Capacity" },
    {
      id: "utilization",
      header: "Utilization",
      cell: ({ row }) => formatPercent(row.original.utilization_pct),
    },
  ];

  const shipmentRows = mockShipments.slice(
    (shipmentPage - 1) * shipmentPageSize,
    shipmentPage * shipmentPageSize,
  );
  const operatorRows = mockOperatorRows.slice(
    (operatorPage - 1) * operatorPageSize,
    operatorPage * operatorPageSize,
  );

  const predictions = [
    mockPredictionFull,
    mockPredictionPartial,
    mockPredictionNoExplanation,
    mockPredictionNoCapacity,
    mockPredictionAllUnavailable,
  ];

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-harbor-navy">
            Component sandbox
          </h1>
          <DemoBadge />
        </div>
        <p className="text-sm text-muted">
          Development-only surface for every shared component and mock state.
          This page is not linked from the primary navigation.
        </p>
      </header>

      <Section
        title="Status badges"
        description="Every shipment status plus the forecast-only marker."
      >
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="submitted" />
          <StatusBadge status="arrived" />
          <StatusBadge status="cleared" />
          <StatusBadge status="at_risk" />
          <StatusBadge status="forecast_only" />
        </div>
      </Section>

      <Section title="Callouts">
        <div className="space-y-3">
          <Callout variant="info">
            Forecasts are estimates, not guarantees. Port capacity is synthetic
            demo data.
          </Callout>
          <Callout variant="warning">
            Demurrage is unavailable because no matching tariff rule exists.
          </Callout>
          <Callout variant="danger">
            The prediction service is unavailable. Try again later.
          </Callout>
        </div>
      </Section>

      <Section
        title="Field"
        description="Label, hint, error and required state are linked to the input."
      >
        <div className="max-w-md">
          <Field
            id="sandbox-reference"
            label="Shipment reference"
            hint="Use the carrier reference."
            error="Reference is required."
            required
          >
            <Input defaultValue="SHIP-2026-001" />
          </Field>
        </div>
      </Section>

      <Section title="Page states">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <PageState state="loading" />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <PageState
              state="empty"
              title="No shipments"
              message="Nothing matches these filters."
              action={{ label: "Clear filters", onClick: () => undefined }}
            />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <PageState
              state="error"
              message="The prediction service is unavailable. Try again later."
              requestId="req_mock_503"
              onRetry={() => undefined}
            />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <PageState state="permission" />
          </div>
        </div>
      </Section>

      <Section
        title="Money"
        description="Decimal strings keep their precision. Missing values are never zero."
      >
        <div className="flex flex-wrap gap-8 rounded-lg border border-border bg-surface p-4">
          <Money amount="1234567.89" />
          <Money amount="0.00" />
          <Money amount={null} reason="No demurrage rule matched." />
        </div>
      </Section>

      <Section
        title="Date and time"
        description="The same UTC instant rendered in each port timezone."
      >
        <div className="space-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
          <p>
            Nhava Sheva:{" "}
            <DateTime
              isoTimestamp="2026-11-02T06:00:00Z"
              timezone="Asia/Kolkata"
            />
          </p>
          <p>
            Singapore:{" "}
            <DateTime
              isoTimestamp="2026-11-02T06:00:00Z"
              timezone="Asia/Singapore"
            />
          </p>
          <p>
            Invalid:{" "}
            <DateTime isoTimestamp="not-a-date" timezone="Asia/Kolkata" />
          </p>
        </div>
      </Section>

      <Section title="Stat cards">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Estimated dwell"
            value={formatDays(6.2)}
            supportingText="Includes free days"
            estimate
          />
          <Stat
            label="Estimated cost"
            value="₹2,85,700.00"
            supportingText="Partial costs are labelled"
            estimate
          />
          <Stat
            label="Yard utilization"
            value={formatPercent(92)}
            supportingText="High threshold is 85%"
          />
          <Stat
            label="At-risk shipments"
            value="3"
            supportingText="One has no API reason"
          />
        </div>
      </Section>

      <Section
        title="Shipment table"
        description="Server pagination contract, caption, empty state and keyboard focus."
      >
        <DataTable
          columns={shipmentColumns}
          data={shipmentRows}
          caption="Demo shipments"
          getRowId={(row) => row.id}
          pagination={{
            page: shipmentPage,
            page_size: shipmentPageSize,
            total: mockShipments.length,
          }}
          onPageChange={setShipmentPage}
        />
      </Section>

      <Section
        title="Prediction states"
        description="Full, partial, explanation unavailable, capacity unavailable, and all unavailable except dwell."
      >
        <div className="space-y-6">
          {predictions.map((prediction) => (
            <article
              key={prediction.prediction_id}
              className="space-y-4 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-harbor-navy">
                    {prediction.prediction_id}
                  </h3>
                  <p className="text-xs text-muted">
                    {prediction.shipment_id} ·{" "}
                    {prediction.provenance.model_version}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>{formatDays(prediction.predicted_dwell_days)}</span>
                  <Money
                    amount={prediction.total_estimated_cost}
                    reason="One or more cost lines are unavailable."
                  />
                  {prediction.total_is_partial ? (
                    <Badge variant="outline">
                      <span className="text-text">Partial total</span>
                    </Badge>
                  ) : null}
                </div>
              </div>

              <CostTable prediction={prediction} />

              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-medium text-text">Capacity</p>
                  {prediction.capacity_snapshot?.status === "available" ? (
                    <p className="text-muted">
                      {formatPercent(
                        prediction.capacity_snapshot.utilization_pct ?? Number.NaN,
                      )}{" "}
                      · {prediction.capacity_snapshot.source_type}
                    </p>
                  ) : (
                    <p className="text-muted">
                      Unavailable —{" "}
                      {prediction.capacity_snapshot?.reason ??
                        "No capacity snapshot."}
                    </p>
                  )}
                </div>
                <div>
                  <p className="font-medium text-text">Explanation</p>
                  {prediction.explanation?.status === "available" ? (
                    <p className="text-muted">
                      {prediction.explanation.features.length} features · base{" "}
                      {formatDays(prediction.explanation.base_value_days ?? 0)}
                    </p>
                  ) : (
                    <p className="text-muted">
                      Unavailable —{" "}
                      {prediction.explanation?.reason ??
                        "No explanation was returned."}
                    </p>
                  )}
                </div>
              </div>

              <ul className="flex flex-wrap gap-2">
                {prediction.warnings.map((warning) => (
                  <li key={warning.code}>
                    <Badge variant="outline">
                      <span className="text-text">{warning.code}</span>
                    </Badge>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="Capacity"
        description="30 days per resource, plus empty and invalid-capacity fixtures."
      >
        <div className="space-y-6">
          <DataTable
            columns={capacityColumns}
            data={mockYardCapacity.slice(0, 7)}
            caption="Yard capacity forecast, first week"
            getRowId={(row) => `${row.resource_type}-${row.bucket_start}`}
          />
          <DataTable
            columns={capacityColumns}
            data={mockBerthCapacity.slice(0, 3)}
            caption="Berth capacity forecast, first three days"
            getRowId={(row) => `${row.resource_type}-${row.bucket_start}`}
          />
          <div className="rounded-lg border border-border bg-surface p-4">
            <PageState
              state="empty"
              title="No capacity buckets"
              message="The API returned an empty list for this range."
            />
          </div>
          <DataTable
            columns={capacityColumns}
            data={mockInvalidCapacity}
            caption="Invalid capacity bucket (total capacity is zero)"
            getRowId={(row) => `${row.resource_type}-${row.bucket_start}`}
          />
          <p className="text-xs text-muted">
            {mockEmptyCapacity.length} empty buckets.
          </p>
        </div>
      </Section>

      <Section
        title="Operator overview"
        description="Three at-risk items, one without API reasons, and 40 rows."
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="At risk"
              value={String(mockOperatorOverview.at_risk_count)}
              supportingText="One item has no reason"
            />
            <Stat
              label="Range"
              value={`${mockOperatorOverview.range.from.slice(0, 10)} to ${mockOperatorOverview.range.to.slice(0, 10)}`}
              supportingText="Maximum 31 days"
            />
            <Stat
              label="Port scope"
              value={String(mockOperatorOverview.port_scope.length)}
              supportingText={mockOperatorOverview.port_scope
                .map((port) => port.name)
                .join(" · ")}
            />
          </div>

          <ul className="space-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
            {mockOperatorOverview.at_risk.map((item) => (
              <li key={item.shipment_id}>
                <span className="font-medium text-text">{item.reference}</span>
                {" — "}
                <span className="text-muted">
                  {item.reasons.length > 0
                    ? item.reasons.map((reason) => reason.message).join(" ")
                    : "Reason unavailable"}
                </span>
              </li>
            ))}
          </ul>

          <DataTable
            columns={operatorColumns}
            data={operatorRows}
            caption="Operator shipments"
            getRowId={(row) => row.shipment.id}
            pagination={{
              page: operatorPage,
              page_size: operatorPageSize,
              total: mockOperatorRows.length,
            }}
            onPageChange={setOperatorPage}
          />

          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Dwell distribution</caption>
              <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Bin start</th>
                  <th scope="col" className="px-3 py-2 font-medium">Bin end</th>
                  <th scope="col" className="px-3 py-2 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {mockOperatorOverview.dwell_distribution.map((bin) => (
                  <tr
                    key={`${bin.bin_start_days}-${bin.bin_end_days}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2">{formatDays(bin.bin_start_days)}</td>
                    <td className="px-3 py-2">{formatDays(bin.bin_end_days)}</td>
                    <td className="px-3 py-2 tabular-nums">{bin.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        title="Tariffs and audit"
        description="Six tariff rules and fifteen audit entries."
      >
        <div className="space-y-6">
          <DataTable
            columns={tariffColumns}
            data={mockTariffs}
            caption="Tariff rules"
            getRowId={(row) => row.id}
          />
          <DataTable
            columns={auditColumns}
            data={mockAuditLogs}
            caption="Audit log"
            getRowId={(row) => row.id}
            pagination={{ page: 1, page_size: 15, total: mockAuditLogs.length }}
          />
        </div>
      </Section>

      <Section
        title="Error responses"
        description="Every error code is reachable with ?mock_error=<status>."
      >
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Mock error responses</caption>
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Code</th>
                <th scope="col" className="px-3 py-2 font-medium">Message</th>
                <th scope="col" className="px-3 py-2 font-medium">Request ID</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(mockErrorResponses).map(([status, body]) => (
                <tr key={status} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{status}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {body.error.code}
                  </td>
                  <td className="px-3 py-2">{body.error.message}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {body.error.request_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
