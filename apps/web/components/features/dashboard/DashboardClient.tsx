"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/shared/Callout";
import { DateTime } from "@/components/shared/DateTime";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { Money } from "@/components/shared/Money";
import { PageState } from "@/components/shared/PageState";
import { Stat } from "@/components/shared/Stat";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RunPredictionButton } from "@/components/features/predictions/RunPredictionButton";
import { useCapacityForecast } from "@/lib/api/hooks/useCapacityForecast";
import { useConfig } from "@/lib/api/hooks/useConfig";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { usePrediction } from "@/lib/api/hooks/usePrediction";
import { useShipmentDetail } from "@/lib/api/hooks/useShipmentDetail";
import { useShipments } from "@/lib/api/hooks/useShipments";
import { useShipmentSummary } from "@/lib/api/hooks/useShipmentSummary";
import { ApiError } from "@/lib/api/client";
import type {
  AppConfig,
  Port,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
} from "@/lib/api/types";
import { formatDate, formatDays, formatPercent } from "@/lib/format";
import { humanizeOption } from "@/lib/shipments/options";

interface DashboardClientProps {
  mockEmpty?: boolean;
  mockCapacityError?: string;
  /** Mock-only: force which shipment the "latest" cards describe. */
  mockLatestShipment?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = 7;
const FORECAST_DAYS = 30;

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  submitted: "Submitted",
  arrived: "Arrived",
  cleared: "Cleared",
};

const COST_LABELS = {
  customs_duty: "Customs duty",
  port_storage: "Port storage",
  demurrage: "Demurrage",
  other_charge: "Other charges",
} as const;

const COST_NOTE =
  "Indicative total; verify against applicable tariffs and carrier terms.";
const PARTIAL_TOTAL_NOTE =
  "Indicative total. Some components could not be calculated.";

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function requestId(error: unknown): string | undefined {
  return error instanceof ApiError ? error.requestId : undefined;
}

function newestPredictionShipment(shipments: Shipment[]): Shipment | null {
  return shipments.reduce<Shipment | null>((latest, shipment) => {
    if (!shipment.latest_prediction) {
      return latest;
    }

    if (!latest?.latest_prediction) {
      return shipment;
    }

    return shipment.latest_prediction.created_at >
      latest.latest_prediction.created_at
      ? shipment
      : latest;
  }, null);
}

function mostRecentlyUpdated(shipments: Shipment[]): Shipment | null {
  return shipments.reduce<Shipment | null>(
    (newest, shipment) =>
      !newest || shipment.updated_at > newest.updated_at ? shipment : newest,
    null,
  );
}

function latestEvent(
  shipment: { events: ShipmentEvent[] } | undefined,
): ShipmentEvent | null {
  return (
    shipment?.events.reduce<ShipmentEvent | null>(
      (latest, event) =>
        !latest || event.occurred_at > latest.occurred_at ? event : latest,
      null,
    ) ?? null
  );
}

function thresholdLabel(
  utilization: number,
  thresholds: AppConfig["capacity_thresholds"],
): string {
  if (utilization >= thresholds.high_pct) return "High utilization";
  if (utilization >= thresholds.moderate_pct) return "Moderate utilization";
  return "Low utilization";
}

function CardState({
  query,
  title,
  empty,
  children,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  title: string;
  empty?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (query.isLoading) {
    return <PageState state="loading" />;
  }

  if (query.isError) {
    return (
      <PageState
        state="error"
        title={title}
        message={errorMessage(query.error)}
        requestId={requestId(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return <>{empty ?? children}</>;
}

export function DashboardClient({
  mockEmpty,
  mockCapacityError,
  mockLatestShipment,
}: DashboardClientProps) {
  const today = React.useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );
  const summaryQuery = useShipmentSummary(mockEmpty);
  const latestQuery = useShipments({
    page: 1,
    pageSize: 100,
    mockEmpty,
  });
  const upcomingQuery = useShipments({
    page: 1,
    pageSize: 5,
    arrivalFrom: today,
    arrivalTo: addDays(today, UPCOMING_DAYS),
    mockEmpty,
  });
  const portsQuery = usePorts();
  const configQuery = useConfig();

  const latestShipment = React.useMemo(() => {
    const shipments = latestQuery.data?.shipments ?? [];

    // ponytail: mock-only selector so a screenshot can show the partial-cost case;
    // drop it once the API exposes a real "latest" query.
    return newestPredictionShipment(
      mockLatestShipment
        ? shipments.filter((shipment) => shipment.id === mockLatestShipment)
        : shipments,
    );
  }, [latestQuery.data, mockLatestShipment]);
  const milestoneShipment = React.useMemo(
    () => mostRecentlyUpdated(latestQuery.data?.shipments ?? []),
    [latestQuery.data],
  );

  const predictionQuery = usePrediction({
    shipmentId: latestShipment?.id ?? "",
    predictionId: latestShipment?.latest_prediction?.prediction_id ?? "",
  });
  const detailQuery = useShipmentDetail({ id: milestoneShipment?.id ?? "" });

  const ports: Port[] = portsQuery.data ?? [];
  const forecastPortId = latestShipment?.port_id ?? ports[0]?.id ?? "";
  const forecastPort = ports.find((port) => port.id === forecastPortId);
  const capacityQuery = useCapacityForecast({
    portId: forecastPortId,
    resourceType: "yard",
    from: today,
    to: addDays(today, FORECAST_DAYS),
    mockCapacityError,
  });

  const timezoneFor = (portId: string) =>
    ports.find((port) => port.id === portId)?.timezone ?? "UTC";

  const summary = summaryQuery.data;
  const predictions = predictionQuery.data;
  const milestone = latestEvent(detailQuery.data);
  const config = configQuery.data;
  const capacityState = {
    isLoading: capacityQuery.isLoading || configQuery.isLoading,
    isError: capacityQuery.isError || configQuery.isError,
    error: capacityQuery.error ?? configQuery.error,
    refetch: () => {
      void capacityQuery.refetch();
      void configQuery.refetch();
    },
  };

  const bucket =
    capacityQuery.data?.buckets.find(
      (item) =>
        item.total_capacity > 0 &&
        Number.isFinite(item.utilization_pct) &&
        item.utilization_pct >= 0 &&
        item.utilization_pct <= 100,
    ) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-harbor-navy">Dashboard</h1>
          <p className="text-sm text-muted">
            Your shipments, forecasts and latest estimates.
          </p>
        </div>
        <Button asChild>
          <Link href="/shipments/new">New shipment</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active shipments</CardTitle>
        </CardHeader>
        <CardContent>
          <CardState
            query={summaryQuery}
            title="Unable to load shipment counts"
            empty={
              summary && summary.total === 0 ? (
                <div className="space-y-4">
                  <PageState
                    state="empty"
                    title="No shipments yet."
                    message="Create your first shipment to get an estimate."
                  />
                  <div className="text-center">
                    <Button asChild variant="outline">
                      <Link href="/shipments/new">Create shipment</Link>
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
          >
            {summary && (
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  Object.keys(STATUS_LABELS) as ShipmentStatus[]
                ).map((status) => (
                  <Stat
                    key={status}
                    label={STATUS_LABELS[status]}
                    value={String(summary.status_counts[status])}
                    supportingText="Across your shipments"
                  />
                ))}
              </div>
            )}
          </CardState>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest predicted dwell</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardState
              query={latestQuery}
              title="Unable to load shipments"
              empty={
                !latestShipment ? (
                  <PageState
                    state="empty"
                    title="No prediction yet."
                    message="Run a prediction on a shipment to see an estimate."
                  />
                ) : undefined
              }
            >
              {latestShipment?.latest_prediction && (
                <>
                  <Stat
                    label="Latest predicted dwell"
                    value={formatDays(
                      latestShipment.latest_prediction.predicted_dwell_days,
                    )}
                    estimate
                    supportingText={`${latestShipment.reference} | ${formatDate(
                      latestShipment.latest_prediction.created_at,
                      timezoneFor(latestShipment.port_id),
                    )}`}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/shipments/${latestShipment.id}`}>
                        Open shipment
                      </Link>
                    </Button>
                    <RunPredictionButton shipmentId={latestShipment.id} />
                  </div>
                </>
              )}
            </CardState>
          </CardContent>
        </Card>

        <Card data-testid="latest-cost-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Latest indicative cost</CardTitle>
            {predictions?.provenance.is_demo_data && <DemoBadge />}
          </CardHeader>
          <CardContent className="space-y-4">
            <CardState
              query={predictionQuery}
              title="Unable to load the latest cost"
              empty={
                !latestShipment ? (
                  <PageState
                    state="empty"
                    title="No prediction yet."
                    message="A cost estimate appears after a prediction runs."
                  />
                ) : undefined
              }
            >
              {predictions && (
                <>
                  <ul className="space-y-2 text-sm">
                    {predictions.cost_breakdown.map((line) => (
                      <li
                        key={line.component}
                        className="flex items-start justify-between gap-4 border-b py-2 last:border-0"
                      >
                        <span className="font-medium">
                          {COST_LABELS[line.component]}
                        </span>
                        <Money amount={line.amount} reason={line.reason} />
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between border-t pt-3 text-sm">
                    <span className="font-medium">Estimated total</span>
                    <Money amount={predictions.total_estimated_cost} />
                  </div>
                  {predictions.total_is_partial && (
                    <Callout variant="warning" className="text-xs">
                      {PARTIAL_TOTAL_NOTE}
                    </Callout>
                  )}
                  <p className="text-xs text-muted">{COST_NOTE}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/shipments/${predictions.shipment_id}/prediction/${predictions.prediction_id}`}
                    >
                      Open prediction
                    </Link>
                  </Button>
                </>
              )}
            </CardState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Upcoming arrivals (next {UPCOMING_DAYS} days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardState
              query={upcomingQuery}
              title="Unable to load upcoming arrivals"
              empty={
                upcomingQuery.data?.shipments.length === 0 ? (
                  <PageState
                    state="empty"
                    title="No arrivals in the next 7 days."
                  />
                ) : undefined
              }
            >
              {upcomingQuery.data && upcomingQuery.data.shipments.length > 0 && (
                <ul className="divide-y">
                  {upcomingQuery.data.shipments.map((shipment) => (
                    <li
                      key={shipment.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
                    >
                      <div className="space-y-1">
                        <Link
                          href={`/shipments/${shipment.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {shipment.reference}
                        </Link>
                        <p className="text-xs text-muted">
                          {humanizeOption(shipment.cargo_type)} |{" "}
                          <DateTime
                            isoTimestamp={shipment.expected_arrival_at}
                            timezone={timezoneFor(shipment.port_id)}
                          />
                        </p>
                      </div>
                      <StatusBadge status={shipment.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest milestone</CardTitle>
          </CardHeader>
          <CardContent>
            <CardState
              query={detailQuery}
              title="Unable to load the latest milestone"
              empty={
                !milestone ? (
                  <PageState
                    state="empty"
                    title="No milestone recorded yet."
                  />
                ) : undefined
              }
            >
              {milestone && milestoneShipment && (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Status changed to</span>
                    <StatusBadge status={milestone.to_status} />
                  </div>
                  <p className="text-muted">
                    <Link
                      href={`/shipments/${milestoneShipment.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {milestoneShipment.reference}
                    </Link>{" "}
                    |{" "}
                    <DateTime
                      isoTimestamp={milestone.occurred_at}
                      timezone={timezoneFor(milestoneShipment.port_id)}
                    />
                  </p>
                  {milestone.actor_display_name && (
                    <p className="text-xs text-muted">
                      by {milestone.actor_display_name}
                    </p>
                  )}
                  {milestone.note && (
                    <p className="text-xs italic text-muted">
                      &ldquo;{milestone.note}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </CardState>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Capacity snapshot</CardTitle>
            {bucket?.source_type === "synthetic" && <DemoBadge />}
          </CardHeader>
          <CardContent className="space-y-3">
            <CardState
              query={capacityState}
              title="Unable to load the capacity snapshot"
              empty={
                !bucket ? (
                  <PageState
                    state="empty"
                    title="No forecast is available for this range."
                  />
                ) : undefined
              }
            >
              {bucket && config && (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-2xl font-semibold tabular-nums text-text">
                      {formatPercent(bucket.utilization_pct)}
                    </span>
                    <span className="text-sm text-muted">
                      ({thresholdLabel(bucket.utilization_pct, config.capacity_thresholds)})
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    Yard at {forecastPort?.name ?? "Selected port"} |{" "}
                    {formatDate(
                      bucket.bucket_start,
                      forecastPort?.timezone ?? "UTC",
                    )}
                  </p>
                  {bucket.source_type === "synthetic" && (
                    <p className="text-xs text-muted">
                      Forecast based on synthetic demo data
                    </p>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href="/capacity">View capacity forecast</Link>
                  </Button>
                </>
              )}
            </CardState>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted">
        PortIQ provides planning estimates, not guarantees. Some figures are
        based on synthetic demo data.
      </p>
    </div>
  );
}
