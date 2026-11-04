"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExplanationFeature } from "@/lib/api/types";

interface ExplanationChartProps {
  features: ExplanationFeature[];
}

interface ChartDatum {
  label: string;
  name: string;
  contribution: number;
  value: string;
}

function humanizeFeatureName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatFeatureValue(value: ExplanationFeature["value"]): string {
  return typeof value === "number"
    ? value.toLocaleString("en-IN")
    : String(value);
}

export function ExplanationChart({ features }: ExplanationChartProps) {
  const data: ChartDatum[] = React.useMemo(
    () =>
      features.map((feature) => {
        const name = humanizeFeatureName(feature.name);
        const value = formatFeatureValue(feature.value);

        return {
          label: `${name} · ${value}`,
          name,
          contribution: feature.contribution,
          value,
        };
      }),
    [features],
  );

  if (features.length === 0) {
    return null;
  }

  const maxAbsContribution = Math.max(
    ...features.map((feature) => Math.abs(feature.contribution)),
    1,
  );
  const domain = maxAbsContribution * 1.1;

  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-medium text-text">
        Feature contributions (days)
      </figcaption>
      <div
        className="h-72 w-full"
        role="img"
        aria-label="Diverging bar chart of each feature's effect on the estimated dwell time in days. The same values are listed in the table below."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 24 }}
          >
            <XAxis
              type="number"
              domain={[-domain, domain]}
              tickFormatter={(value: number) =>
                `${value > 0 ? "+" : ""}${value.toFixed(1)}`
              }
              label={{
                value: "Effect on estimate (days)",
                position: "insideBottom",
                offset: -12,
                fontSize: 12,
              }}
              tick={{ fontSize: 12 }}
              aria-hidden="true"
            />
            <YAxis
              type="category"
              dataKey="label"
              width={190}
              tick={{ fontSize: 12 }}
              aria-hidden="true"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) {
                  return null;
                }

                const item = payload[0].payload as ChartDatum;
                const direction =
                  item.contribution >= 0 ? "increased" : "decreased";

                return (
                  <div className="rounded border border-border bg-surface p-2 text-sm shadow-sm">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-muted">Value: {item.value}</p>
                    <p>
                      {item.name} {direction} the model estimate by{" "}
                      {Math.abs(item.contribution).toFixed(1)} days.
                    </p>
                  </div>
                );
              }}
            />
            <ReferenceLine x={0} stroke="#D9E2EC" />
            <Bar dataKey="contribution" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={
                    entry.contribution >= 0 ? "#B7791F" : "#1F8A5B"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <div className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded"
            style={{ backgroundColor: "#1F8A5B" }}
          />
          <span>Decreased estimate</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded"
            style={{ backgroundColor: "#B7791F" }}
          />
          <span>Increased estimate</span>
        </div>
      </div>
    </figure>
  );
}
