"use client";

import { SectionTitle } from "@/components/shared/SectionTitle";
import {
  Anchor,
  BarChart3,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/shared/InfoTip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageState } from "@/components/shared/PageState";
import { Callout } from "@/components/shared/Callout";
import { DateTime } from "@/components/shared/DateTime";
import { useCapacityForecast } from "@/lib/api/hooks/useCapacityForecast";
import { useConfig } from "@/lib/api/hooks/useConfig";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { useActivePort } from "@/components/providers/ActivePortProvider";
import { ApiError } from "@/lib/api/client";
import type { CapacityBucket, ResourceType } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { CapacityChart, ThresholdLegend } from "./CapacityChart";
import { CapacityTable } from "./CapacityTable";

interface CapacityClientProps {
  mockEmpty?: boolean;
  mockInvalid?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

const TABS: ReadonlyArray<{ value: ResourceType; label: string }> = [
  { value: "yard", label: "Yard" },
  { value: "berth", label: "Berth" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  return new Date(
    Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );
}

function isValidBucket(bucket: CapacityBucket): boolean {
  return (
    bucket.total_capacity > 0 &&
    Number.isFinite(bucket.utilization_pct) &&
    bucket.utilization_pct >= 0 &&
    bucket.utilization_pct <= 100
  );
}

export function CapacityClient({
  mockEmpty,
  mockInvalid,
}: CapacityClientProps) {
  const portsQuery = usePorts();
  const configQuery = useConfig();
  const today = React.useMemo(todayIso, []);
  const [portId, setPortId] = React.useState("");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(() => addDays(today, DEFAULT_RANGE_DAYS));
  const [resourceType, setResourceType] = React.useState<ResourceType>("yard");

  const ports = portsQuery.data ?? [];
  const activePort = useActivePort().portId;
  // A port picked on this page wins; otherwise the sidebar's active port, then the first port.
  const defaultPortId = ports.some((item) => item.id === activePort) ? activePort : null;
  const selectedPortId = portId || defaultPortId || ports[0]?.id || "";
  const port = ports.find((item) => item.id === selectedPortId);
  const timezone = port?.timezone ?? "UTC";
  const config = configQuery.data;
  const maxDays = config?.max_forecast_range_days ?? 0;
  const rangeDays = daysBetween(from, to);
  const rangeTooLong =
    !!config && Number.isFinite(rangeDays) && rangeDays > maxDays;
  const rangeUnusable = !from || !to || !Number.isFinite(rangeDays) || rangeDays <= 0;
  const rangeBlocked = rangeUnusable || rangeTooLong;

  const forecastQuery = useCapacityForecast({
    portId: selectedPortId,
    resourceType,
    from,
    to,
    mockEmpty,
    mockInvalid,
    enabled: !rangeBlocked && !!config,
  });

  if (portsQuery.isLoading || configQuery.isLoading) {
    return <PageState state="loading" />;
  }

  if (portsQuery.isError || configQuery.isError) {
    const error = portsQuery.error ?? configQuery.error;
    return (
      <PageState
        state="error"
        title="Unable to load capacity forecast"
        message={
          error instanceof ApiError ? error.message : "Something went wrong."
        }
        requestId={error instanceof ApiError ? error.requestId : undefined}
        onRetry={() => {
          void portsQuery.refetch();
          void configQuery.refetch();
        }}
      />
    );
  }

  if (!config || !port) {
    return (
      <PageState
        state="empty"
        title="No forecast is available for this range."
      />
    );
  }

  if (forecastQuery.isError) {
    const error = forecastQuery.error;

    if (error instanceof ApiError && error.status === 403) {
      return <PageState state="permission" />;
    }

    return (
      <PageState
        state="error"
        title="Unable to load capacity forecast"
        message={
          error instanceof ApiError ? error.message : "Something went wrong."
        }
        requestId={error instanceof ApiError ? error.requestId : undefined}
        onRetry={() => void forecastQuery.refetch()}
      />
    );
  }

  const buckets = forecastQuery.data?.buckets ?? [];
  const validBuckets = buckets.filter(isValidBucket);
  const skipped = buckets.length - validBuckets.length;
  const generatedAt = buckets[0]?.generated_at;
  const isSynthetic = buckets[0]?.source_type === "synthetic";

  const selectTab = (value: ResourceType) => {
    setResourceType(value);
    document.getElementById(`capacity-tab-${value}`)?.focus();
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.value === resourceType);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    selectTab(next.value);
  };

  return (
    <div className="space-y-section">
      <PageHeader
        icon={BarChart3}
        title="Capacity forecast"
        description="How full the yard and berths are expected to be at a port over the coming days. High utilization often means longer dwell."
      />

      <Card>
        <CardHeader>
          <SectionTitle icon={SlidersHorizontal}>Forecast controls <InfoTip label="Forecast controls">Pick a port, date range and area (yard or berth) to see how full it is expected to be.</InfoTip></SectionTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="capacity-port">Port</Label>
              <select
                id="capacity-port"
                value={selectedPortId}
                onChange={(event) => setPortId(event.target.value)}
                className="flex h-control w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ports.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capacity-from">From</Label>
              <Input
                id="capacity-from"
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
              <Label htmlFor="capacity-to">To</Label>
              <Input
                id="capacity-to"
                type="date"
                value={to}
                min={from}
                max={from ? addDays(from, maxDays) : undefined}
                aria-invalid={rangeTooLong}
                aria-describedby={rangeTooLong ? "capacity-range-error" : undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <span id="capacity-area-label" className="block text-sm font-medium leading-none">
                Area
              </span>
              <div
                role="tablist"
                aria-label="Resource type"
                aria-describedby="capacity-area-label"
                className="inline-flex h-control items-center gap-1 rounded-lg border border-input bg-surface p-1 shadow-sm coarse:h-auto"
              >
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    id={`capacity-tab-${tab.value}`}
                    type="button"
                    role="tab"
                    aria-selected={resourceType === tab.value}
                    aria-controls="capacity-panel"
                    tabIndex={resourceType === tab.value ? 0 : -1}
                    onClick={() => setResourceType(tab.value)}
                    onKeyDown={onTabKeyDown}
                    className={cn(
                      "h-8 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-control",
                      resourceType === tab.value
                        ? "bg-ocean-teal text-white shadow-sm"
                        : "text-text hover:bg-canvas",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {rangeTooLong && (
            <Callout variant="danger" className="text-xs">
              <p id="capacity-range-error">
                The date range cannot exceed {maxDays} days.
              </p>
            </Callout>
          )}
        </CardContent>
      </Card>

      <div
        role="tabpanel"
        id="capacity-panel"
        aria-labelledby={`capacity-tab-${resourceType}`}
        className="space-y-section"
      >
        {!rangeBlocked && (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <SectionTitle
                icon={resourceType === "yard" ? BarChart3 : Anchor}
                info={<InfoTip label="utilization">Share of capacity expected to be in use each day. The chart and the table show the same numbers.</InfoTip>}
              >
                {resourceType === "yard" ? "Yard" : "Berth"} utilization
              </SectionTitle>
              <ThresholdLegend thresholds={config.capacity_thresholds} />
            </CardHeader>
            <CardContent className="space-y-4">
              {skipped > 0 && (
                <Callout variant="warning" className="text-xs">
                  {skipped} {skipped === 1 ? "bucket" : "buckets"} could not be
                  shown
                </Callout>
              )}

              {forecastQuery.isLoading ? (
                <PageState state="loading" />
              ) : validBuckets.length === 0 ? (
                <PageState
                  state="empty"
                  title="No forecast is available for this range."
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    {generatedAt && (
                      <span>
                        Forecast generated at{" "}
                        <DateTime
                          isoTimestamp={generatedAt}
                          timezone={timezone}
                        />
                      </span>
                    )}
                    {isSynthetic && <span>Forecast based on synthetic demo data</span>}
                  </div>

                  <CapacityChart
                    buckets={validBuckets}
                    resourceType={resourceType}
                    timezone={timezone}
                    thresholds={config.capacity_thresholds}
                  />
                  <CapacityTable
                    buckets={validBuckets}
                    timezone={timezone}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
