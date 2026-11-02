"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Callout } from "@/components/shared/Callout";
import { DataTable } from "@/components/shared/DataTable";
import { DateTime } from "@/components/shared/DateTime";
import { Field } from "@/components/shared/Field";
import { PageState } from "@/components/shared/PageState";
import { Stat } from "@/components/shared/Stat";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SelectControl } from "@/components/features/shipments/SelectControl";
import {
  CapacityChart,
  ThresholdLegend,
} from "@/components/features/capacity/CapacityChart";
import { useConfig } from "@/lib/api/hooks/useConfig";
import { useOperatorOverview } from "@/lib/api/hooks/useOperatorOverview";
import { useOperatorShipments } from "@/lib/api/hooks/useOperatorShipments";
import { ApiError } from "@/lib/api/client";
import type {
  AtRiskItem,
  CapacityBucket,
  DwellBin,
  OperatorShipmentRow,
  ShipmentStatus,
  WarningCode,
} from "@/lib/api/types";
import { formatDate, formatPercent } from "@/lib/format";
import {
  SHIPMENT_STATUS_OPTIONS,
  humanizeOption,
  isShipmentStatus,
} from "@/lib/shipments/options";
import { OPERATOR_PAGE_SIZE } from "@/lib/operator/api";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const TIMEZONE = "UTC";

const STATUS_SELECT_OPTIONS = SHIPMENT_STATUS_OPTIONS.map((value) => ({
  value,
  label: humanizeOption(value),
}));

const WARNING_SELECT_OPTIONS = [
  { value: "DEMO_DATA", label: "Demo data" },
  { value: "CAPACITY_UNAVAILABLE", label: "Capacity unavailable" },
  { value: "EXPLANATION_UNAVAILABLE", label: "Explanation unavailable" },
  { value: "TARIFF_MISSING", label: "Tariff missing" },
  { value: "OUT_OF_RANGE_INPUT", label: "Out of range input" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );
}

function formatDwell(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not predicted yet";
  }

  return `${value.toFixed(1)} ${value === 1 ? "day" : "days"}`;
}

/** Only API reasons are shown; a missing list never invents one. */
export function atRiskMessages(item: AtRiskItem): string[] {
  const messages = item.reasons.map((reason) => reason.message).filter(Boolean);

  return messages.length > 0 ? messages : ["Reason unavailable"];
}

function utilizationValue(buckets: CapacityBucket[]): {
  value: string;
  date: string | null;
} {
  const first = buckets[0];

  if (!first || !Number.isFinite(first.utilization_pct)) {
    return { value: "Unavailable", date: null };
  }

  return {
    value: formatPercent(first.utilization_pct),
    date: first.bucket_start,
  };
}

function DwellDistribution({ bins }: { bins: DwellBin[] }) {
  if (bins.length === 0) {
    return (
      <p className="text-sm text-muted">
        No dwell distribution is available for this range.
      </p>
    );
  }

  const data = bins.map((bin) => ({
    label: `${bin.bin_start_days}–${bin.bin_end_days}`,
    count: bin.count,
  }));

  return (
    <div className="space-y-4">
      <figure className="space-y-3">
        <figcaption className="text-sm font-medium text-text">
          Predicted dwell by bin (days)
        </figcaption>
        <div
          className="h-64 w-full"
          role="img"
          aria-label={`Bar chart of predicted dwell distribution across ${bins.length} bins. The same values are listed in the table below.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
            >
              <CartesianGrid stroke="#E5EAF0" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                label={{
                  value: "Dwell bin (days)",
                  position: "insideBottom",
                  offset: -16,
                  fontSize: 12,
                }}
                aria-hidden="true"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                width={40}
                aria-hidden="true"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null;
                  }

                  const item = payload[0].payload as {
                    label: string;
                    count: number;
                  };

                  return (
                    <div className="rounded border border-border bg-surface p-2 text-sm shadow-sm">
                      <p className="font-medium">{item.label} days</p>
                      <p className="text-muted">Shipments: {item.count}</p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="count"
                name="Shipments"
                fill="#0D9488"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Dwell distribution table alternative
          </caption>
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Bin (days)
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr
                key={`${bin.bin_start_days}-${bin.bin_end_days}`}
                className="border-t border-border"
              >
                <td className="px-3 py-2">
                  {bin.bin_start_days}–{bin.bin_end_days}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {bin.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OperatorClient() {
  const configQuery = useConfig();
  const today = React.useMemo(todayIso, []);
  const maxDays = configQuery.data?.max_forecast_range_days ?? 31;

  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(() => addDays(today, DEFAULT_RANGE_DAYS));
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<ShipmentStatus | "">("");
  const [arrivalFrom, setArrivalFrom] = React.useState("");
  const [arrivalTo, setArrivalTo] = React.useState("");
  const [minDwell, setMinDwell] = React.useState("");
  const [warningCode, setWarningCode] = React.useState<WarningCode | "">("");

  const rangeDays = daysBetween(from, to);
  const rangeTooLong =
    !!configQuery.data && Number.isFinite(rangeDays) && rangeDays > maxDays;
  const rangeUnusable =
    !from || !to || !Number.isFinite(rangeDays) || rangeDays <= 0;

  const overviewQuery = useOperatorOverview({
    from,
    to,
    enabled: !!configQuery.data && !rangeUnusable && !rangeTooLong,
  });

  const shipmentsQuery = useOperatorShipments({
    status: status || undefined,
    arrivalFrom: arrivalFrom || undefined,
    arrivalTo: arrivalTo || undefined,
    minPredictedDwellDays: minDwell || undefined,
    warningCode: warningCode || undefined,
    page,
    pageSize: OPERATOR_PAGE_SIZE,
  });

  React.useEffect(() => {
    setPage(1);
  }, [status, arrivalFrom, arrivalTo, minDwell, warningCode]);

  if (configQuery.isLoading) {
    return <PageState state="loading" />;
  }

  if (configQuery.isError) {
    const error = configQuery.error;

    if (error instanceof ApiError && error.status === 403) {
      return <PageState state="permission" />;
    }

    return (
      <PageState
        state="error"
        title="Unable to load operator overview"
        message={
          error instanceof ApiError ? error.message : "Something went wrong."
        }
        requestId={error instanceof ApiError ? error.requestId : undefined}
        onRetry={() => void configQuery.refetch()}
      />
    );
  }

  const config = configQuery.data;

  if (!config) {
    return <PageState state="loading" />;
  }

  const overview = overviewQuery.data;
  const portScope = overview?.port_scope ?? [];
  const yardUtil = utilizationValue(overview?.utilization.yard ?? []);
  const berthUtil = utilizationValue(overview?.utilization.berth ?? []);
  const rows = shipmentsQuery.data?.rows ?? [];
  const pagination = shipmentsQuery.data?.pagination;

  const columns: ColumnDef<OperatorShipmentRow, unknown>[] = [
    {
      header: "Reference",
      cell: ({ row }) => (
        <Link
          href={`/shipments/${row.original.shipment.id}`}
          className="font-medium text-harbor-navy underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {row.original.shipment.reference}
        </Link>
      ),
    },
    {
      header: "Port",
      cell: ({ row }) =>
        portScope.find((port) => port.id === row.original.shipment.port_id)
          ?.name ?? row.original.shipment.port_id,
    },
    {
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.shipment.status} />,
    },
    {
      header: "At risk",
      cell: ({ row }) =>
        row.original.at_risk_reasons.length > 0 ? (
          <StatusBadge status="at_risk" />
        ) : (
          <span className="text-muted">No</span>
        ),
    },
    {
      header: "Expected arrival",
      cell: ({ row }) => (
        <DateTime
          isoTimestamp={row.original.shipment.expected_arrival_at}
          timezone={TIMEZONE}
        />
      ),
    },
    {
      header: "Predicted dwell",
      cell: ({ row }) =>
        formatDwell(
          row.original.shipment.latest_prediction?.predicted_dwell_days ?? null,
        ),
    },
    {
      header: "Warning codes",
      cell: ({ row }) =>
        row.original.warning_codes.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          row.original.warning_codes.map(humanizeOption).join(", ")
        ),
    },
  ];

  const hasFilters = Boolean(
    status || arrivalFrom || arrivalTo || minDwell || warningCode,
  );

  function clearFilters() {
    setStatus("");
    setArrivalFrom("");
    setArrivalTo("");
    setMinDwell("");
    setWarningCode("");
    setPage(1);
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-harbor-navy">
          Operator overview
        </h1>
        <p className="text-sm text-muted">
          Port scope: {portScope.map((port) => port.name).join(", ") || "—"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Date range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="operator-from">From</Label>
              <Input
                id="operator-from"
                type="date"
                value={from}
                max={to}
                onChange={(event) => {
                  const next = event.target.value;
                  setFrom(next);
                  if (next && to && to <= next) {
                    setTo(addDays(next, 1));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operator-to">To</Label>
              <Input
                id="operator-to"
                type="date"
                value={to}
                min={from}
                max={from ? addDays(from, maxDays) : undefined}
                aria-invalid={rangeTooLong}
                aria-describedby={
                  rangeTooLong ? "operator-range-error" : undefined
                }
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
          {rangeTooLong && (
            <Callout variant="danger" className="text-xs">
              <p id="operator-range-error">
                The date range cannot exceed {maxDays} days.
              </p>
            </Callout>
          )}
          <p className="text-xs text-muted">
            Dates and charts use UTC. The table filters below are independent of
            this range.
          </p>
        </CardContent>
      </Card>

      {overviewQuery.isError ? (
        overviewQuery.error instanceof ApiError &&
        overviewQuery.error.status === 403 ? (
          <PageState state="permission" />
        ) : (
          <PageState
            state="error"
            title="Unable to load operator overview"
            message={
              overviewQuery.error instanceof ApiError
                ? overviewQuery.error.message
                : "Something went wrong."
            }
            requestId={
              overviewQuery.error instanceof ApiError
                ? overviewQuery.error.requestId
                : undefined
            }
            onRetry={() => void overviewQuery.refetch()}
          />
        )
      ) : null}

      {overviewQuery.isLoading && !overview ? (
        <PageState state="loading" />
      ) : null}

      {overview ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Stat
              label="Submitted"
              value={String(overview.status_counts.submitted)}
            />
            <Stat
              label="Arrived"
              value={String(overview.status_counts.arrived)}
            />
            <Stat
              label="Cleared"
              value={String(overview.status_counts.cleared)}
            />
            <Stat
              label="Yard utilization"
              value={yardUtil.value}
              estimate
              supportingText={
                yardUtil.date
                  ? `First bucket: ${formatDate(yardUtil.date, TIMEZONE)} UTC`
                  : undefined
              }
            />
            <Stat
              label="Berth utilization"
              value={berthUtil.value}
              estimate
              supportingText={
                berthUtil.date
                  ? `First bucket: ${formatDate(berthUtil.date, TIMEZONE)} UTC`
                  : undefined
              }
            />
            <Stat
              label="At risk"
              value={String(overview.at_risk_count)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Yard utilization</CardTitle>
                <ThresholdLegend
                  thresholds={config.capacity_thresholds}
                />
              </CardHeader>
              <CardContent>
                {overview.utilization.yard.length === 0 ? (
                  <p className="text-sm text-muted">
                    No utilization forecast is available for this range.
                  </p>
                ) : (
                  <CapacityChart
                    buckets={overview.utilization.yard}
                    resourceType="yard"
                    timezone={TIMEZONE}
                    thresholds={config.capacity_thresholds}
                    timezoneLabel="UTC"
                    hasTableAlternative={false}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Berth utilization</CardTitle>
                <ThresholdLegend
                  thresholds={config.capacity_thresholds}
                />
              </CardHeader>
              <CardContent>
                {overview.utilization.berth.length === 0 ? (
                  <p className="text-sm text-muted">
                    No utilization forecast is available for this range.
                  </p>
                ) : (
                  <CapacityChart
                    buckets={overview.utilization.berth}
                    resourceType="berth"
                    timezone={TIMEZONE}
                    thresholds={config.capacity_thresholds}
                    timezoneLabel="UTC"
                    hasTableAlternative={false}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dwell distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <DwellDistribution bins={overview.dwell_distribution} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">At-risk list</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.at_risk.length === 0 ? (
                <p className="text-sm text-muted">
                  No shipments are at risk in this range.
                </p>
              ) : (
                <ul className="space-y-3">
                  {overview.at_risk.map((item) => (
                    <li
                      key={item.shipment_id}
                      data-testid={`at-risk-${item.shipment_id}`}
                      className="rounded-lg border border-border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/shipments/${item.shipment_id}`}
                          className="font-medium text-harbor-navy underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {item.reference}
                        </Link>
                        <StatusBadge status="at_risk" />
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-muted">
                        {atRiskMessages(item).map((message, index) => (
                          <li key={`${item.shipment_id}-${index}`}>{message}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Field id="operator-status" label="Status">
              <SelectControl
                placeholder="All statuses"
                options={STATUS_SELECT_OPTIONS}
                value={status}
                onChange={(event) => {
                  const value = event.target.value;
                  setStatus(isShipmentStatus(value) ? value : "");
                }}
              />
            </Field>
            <Field id="operator-arrival-from" label="Arrival from" hint="UTC day">
              <Input
                type="date"
                value={arrivalFrom}
                onChange={(event) => setArrivalFrom(event.target.value)}
              />
            </Field>
            <Field id="operator-arrival-to" label="Arrival to" hint="UTC day">
              <Input
                type="date"
                value={arrivalTo}
                onChange={(event) => setArrivalTo(event.target.value)}
              />
            </Field>
            <Field id="operator-min-dwell" label="Min predicted dwell (days)">
              <Input
                type="number"
                min="0"
                step="0.1"
                value={minDwell}
                onChange={(event) => setMinDwell(event.target.value)}
              />
            </Field>
            <Field id="operator-warning" label="Warning type">
              <SelectControl
                placeholder="All warnings"
                options={WARNING_SELECT_OPTIONS}
                value={warningCode}
                onChange={(event) =>
                  setWarningCode(
                    event.target.value === ""
                      ? ""
                      : (event.target.value as WarningCode),
                  )
                }
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                disabled={!hasFilters}
              >
                Clear filters
              </Button>
            </div>
          </div>

          {shipmentsQuery.isError ? (
            shipmentsQuery.error instanceof ApiError &&
            shipmentsQuery.error.status === 403 ? (
              <PageState state="permission" />
            ) : (
              <PageState
                state="error"
                title="Unable to load shipments"
                message={
                  shipmentsQuery.error instanceof ApiError
                    ? shipmentsQuery.error.message
                    : "Something went wrong."
                }
                requestId={
                  shipmentsQuery.error instanceof ApiError
                    ? shipmentsQuery.error.requestId
                    : undefined
                }
                onRetry={() => void shipmentsQuery.refetch()}
              />
            )
          ) : null}

          {shipmentsQuery.isLoading && !shipmentsQuery.data ? (
            <PageState state="loading" />
          ) : null}

          {shipmentsQuery.isSuccess ? (
            <DataTable
              columns={columns}
              data={rows}
              caption="Operator shipments"
              getRowId={(row) => row.shipment.id}
              pagination={pagination}
              onPageChange={setPage}
              isLoading={shipmentsQuery.isFetching && !shipmentsQuery.isLoading}
              emptyMessage="No shipments match the filters."
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
