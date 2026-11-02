"use client";

import type { ExplanationFeature } from "@/lib/api/types";

interface ExplanationTableProps {
  features: ExplanationFeature[];
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
    <div className="w-full max-w-full overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Feature contributions to the estimated dwell time, shown as a text
          alternative to the chart.
        </caption>
        <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Feature
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Value
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Effect (days)
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              What it means
            </th>
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => (
            <tr key={feature.name} className="border-t border-border">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {humanizeFeatureName(feature.name)}
              </th>
              <td className="px-3 py-2">{formatFeatureValue(feature.value)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {feature.contribution > 0 ? "+" : ""}
                {feature.contribution.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-muted">
                {featureSentence(feature)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
