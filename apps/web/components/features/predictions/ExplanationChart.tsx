"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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

/** Narrow screens get a slimmer label column so the bars keep room. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function ExplanationChart({ features }: ExplanationChartProps) {
  const narrow = useNarrow();
  const data: ChartDatum[] = React.useMemo(
    () =>
      // Largest effect first, matching the breakdown table.
      [...features].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).map((feature) => {
        const name = humanizeFeatureName(feature.name);
        const value = formatFeatureValue(feature.value);

        return {
          label: `${name} - ${value}`,
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

  const legend = (
    <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-muted">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: "rgb(var(--chart-decrease, var(--success)))" }}
        />
        <span>Decreased estimate</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: "rgb(var(--chart-increase, var(--warning)))" }}
        />
        <span>Increased estimate</span>
      </div>
    </div>
  );

  return (
    <figure className="space-y-2">
      {legend}
      <div
        className="w-full"
        style={{ height: Math.max(240, data.length * 34 + 56) }}
        role="img"
        aria-label="Diverging bar chart of each feature's effect on the estimated dwell time in days. The same values are listed in the feature breakdown table."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 24 }}
            barCategoryGap="30%"
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 3"
              stroke="rgb(var(--chart-grid, var(--border)))"
            />
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
              tick={{ fontSize: 11 }}
              stroke="rgb(var(--muted))"
              aria-hidden="true"
            />
            <YAxis
              type="category"
              dataKey={narrow ? "name" : "label"}
              width={narrow ? 104 : 240}
              tick={{ fontSize: narrow ? 10 : 12, fill: "rgb(var(--text))" }}
              tickLine={false}
              // Long names would clip at the chart edge; the tooltip and table show them in full.
              tickFormatter={(text: string) => {
                const max = narrow ? 16 : 34;
                return text.length > max ? `${text.slice(0, max - 1)}…` : text;
              }}
              stroke="rgb(var(--border))"
              aria-hidden="true"
            />
            <Tooltip
              cursor={{ fill: "rgb(var(--canvas))" }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) {
                  return null;
                }

                const item = payload[0].payload as ChartDatum;
                const direction =
                  item.contribution >= 0 ? "increased" : "decreased";

                return (
                  <div className="rounded-lg border border-border bg-surface p-2 text-sm shadow-sm">
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
            <ReferenceLine x={0} stroke="rgb(var(--muted))" />
            <Bar dataKey="contribution" radius={[4, 4, 4, 4]} maxBarSize={14} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={
                    entry.contribution >= 0
                      ? "rgb(var(--chart-increase, var(--warning)))"
                      : "rgb(var(--chart-decrease, var(--success)))"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
