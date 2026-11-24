"use client";

import type { ExplanationFeature } from "@/lib/api/types";

interface ExplanationTableProps {
  features: ExplanationFeature[];
}

export function humanizeFeatureName(name: string): string {
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

function featureSentence(feature: ExplanationFeature): string {
  const name = humanizeFeatureName(feature.name);
  const days = Math.abs(feature.contribution).toFixed(1);

  if (feature.contribution > 0) {
    return `${name} increased the model estimate by ${days} days.`;
  }

  if (feature.contribution < 0) {
    return `${name} decreased the model estimate by ${days} days.`;
  }

  return `${name} did not change the model estimate.`;
}

export function ExplanationTable({ features }: ExplanationTableProps) {
  if (features.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="app-table-grid w-full min-w-[560px] text-sm">
        <caption className="sr-only">
          Feature contributions to the estimated dwell time, shown as a text
          alternative to the chart.
        </caption>
        <thead className="bg-canvas text-left text-xs text-text">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Feature
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Value
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold">
              Effect (days)
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              What it means
            </th>
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => (
            <tr key={feature.name} className="border-t border-border">
              <th scope="row" className="px-3 py-2.5 text-left font-semibold text-harbor-navy">
                {humanizeFeatureName(feature.name)}
              </th>
              <td className="px-3 py-2.5">{formatFeatureValue(feature.value)}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                {feature.contribution > 0 ? "+" : ""}
                {feature.contribution.toFixed(1)}
              </td>
              <td className="px-3 py-2.5 text-muted">
                {featureSentence(feature)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
