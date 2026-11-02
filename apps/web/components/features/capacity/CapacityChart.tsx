"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppConfig, CapacityBucket, ResourceType } from "@/lib/api/types";
import { formatDate, formatPercent, formatShortDate } from "@/lib/format";

interface CapacityChartProps {
  buckets: CapacityBucket[];
  resourceType: ResourceType;
  timezone: string;
  thresholds: AppConfig["capacity_thresholds"];
  /** Phrase used in the accessible summary, e.g. "UTC". */
  timezoneLabel?: string;
  /** Set false when no table repeats the chart values. */
  hasTableAlternative?: boolean;
}

interface ChartDatum {
  label: string;
  start: string;
  utilization: number;
}

export function ThresholdLegend({
  thresholds,
}: {
  thresholds: AppConfig["capacity_thresholds"];
}) {
  const items = [
    {
      label: "Lower",
      range: `below ${formatPercent(thresholds.moderate_pct)}`,
      color: "#1F8A5B",
    },
    {
      label: "Moderate",
      range: `from ${formatPercent(thresholds.moderate_pct)}`,
      color: "#B7791F",
    },
    {
      label: "High",
      range: `from ${formatPercent(thresholds.high_pct)}`,
      color: "#C2413A",
    },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="font-medium text-text">{item.label}</span>
          <span>{item.range}</span>
        </li>
      ))}
    </ul>
  );
}

export function CapacityChart({
  buckets,
  resourceType,
  timezone,
  thresholds,
  timezoneLabel = "the port timezone",
  hasTableAlternative = true,
}: CapacityChartProps) {
  const data: ChartDatum[] = React.useMemo(
    () =>
      buckets.map((bucket) => ({
        label: formatShortDate(bucket.bucket_start, timezone),
        start: bucket.bucket_start,
        utilization: bucket.utilization_pct,
      })),
    [buckets, timezone],
  );

  if (buckets.length === 0) {
    return null;
  }

  const first = formatDate(buckets[0].bucket_start, timezone);
  const last = formatDate(buckets[buckets.length - 1].bucket_start, timezone);
  const resourceLabel = resourceType === "berth" ? "berth" : "yard";

  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-medium text-text">
        Daily {resourceLabel} utilization (%)
      </figcaption>
      <div
        className="h-80 w-full"
        role="img"
        aria-label={`Line chart of daily ${resourceLabel} utilization percent from ${first} to ${last} in ${timezoneLabel}.${hasTableAlternative ? " The same values are listed in the table below." : ""}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 24, left: 8, bottom: 28 }}
          >
            <CartesianGrid stroke="#E5EAF0" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              minTickGap={16}
              label={{
                value: "Date",
                position: "insideBottom",
                offset: -18,
                fontSize: 12,
              }}
              aria-hidden="true"
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fontSize: 12 }}
              width={52}
              label={{
                value: "Utilization (%)",
                angle: -90,
                position: "insideLeft",
                offset: 12,
                fontSize: 12,
              }}
              aria-hidden="true"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) {
                  return null;
                }

                const item = payload[0].payload as ChartDatum;

                return (
                  <div className="rounded border border-border bg-surface p-2 text-sm shadow-sm">
                    <p className="font-medium">
                      {formatDate(item.start, timezone)}
                    </p>
                    <p className="text-muted">
                      Utilization: {item.utilization}%
                    </p>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={thresholds.high_pct}
              stroke="#C2413A"
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={thresholds.moderate_pct}
              stroke="#B7791F"
              strokeDasharray="4 4"
            />
            <Line
              type="monotone"
              dataKey="utilization"
              name="Utilization"
              stroke="#0D9488"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
