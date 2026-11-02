"use client";

import type { CapacityBucket } from "@/lib/api/types";
import { formatDate, formatPercent } from "@/lib/format";

interface CapacityTableProps {
  buckets: CapacityBucket[];
  timezone: string;
}

function humanizeSource(source: CapacityBucket["source_type"]): string {
  return source === "imported" ? "Imported" : "Synthetic";
}

export function CapacityTable({ buckets, timezone }: CapacityTableProps) {
  if (buckets.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-full overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Daily capacity buckets as a text alternative to the chart.
        </caption>
        <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Start
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Occupied
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Capacity
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Utilization
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Source
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Version
            </th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.bucket_start} className="border-t border-border">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {formatDate(bucket.bucket_start, timezone)}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">
                {bucket.predicted_occupied.toLocaleString("en-IN")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {bucket.total_capacity.toLocaleString("en-IN")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatPercent(bucket.utilization_pct)}
              </td>
              <td className="px-3 py-2">{humanizeSource(bucket.source_type)}</td>
              <td className="px-3 py-2 text-muted">
                {bucket.model_or_rule_version}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
