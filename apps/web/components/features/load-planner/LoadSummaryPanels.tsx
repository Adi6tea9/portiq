"use client";

import { AlertTriangle, CheckCircle2, MousePointerClick } from "lucide-react";
import { CARGO_CATEGORIES } from "@/lib/load-planner/config";
import type { LoadingSummary, Parcel, ValidationIssue } from "@/lib/load-planner/types";
import { cn } from "@/lib/utils";
import { CategorySwatch, formatDims } from "./CargoList";

const kg = (value: number) => `${Math.round(value).toLocaleString("en-GB")} kg`;
const m3 = (value: number) => `${value.toFixed(1)} m³`;

function Donut({ percent }: { percent: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgb(var(--border))"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={percent > 100 ? "rgb(var(--danger))" : "rgb(var(--primary))"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          className="transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-text">
          {Math.round(percent)}%
        </span>
        <span className="text-[11px] text-muted">Volume used</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-text">{value}</dd>
    </div>
  );
}

export function UtilizationSummary({
  summary,
  issues,
}: {
  summary: LoadingSummary;
  issues: ValidationIssue[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Donut percent={summary.volumeUtilization} />
        <dl className="min-w-0 flex-1 divide-y divide-border">
          <Row label="Used" value={m3(summary.usedVolume)} />
          <Row label="Total" value={m3(summary.containerVolume)} />
          <Row label="Remaining" value={m3(summary.remainingVolume)} />
        </dl>
      </div>
      <dl className="divide-y divide-border rounded-lg border border-border px-3">
        <Row label="Total weight" value={kg(summary.totalWeight)} />
        <Row label="Max payload" value={kg(summary.maxPayload)} />
        <Row label="Payload remaining" value={kg(summary.payloadRemaining)} />
        <Row label="Parcels loaded" value={String(summary.parcelCount)} />
      </dl>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-text">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
          Load fits within container limits.
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label="Loading warnings">
          {issues.map((issue) => (
            <li
              key={issue.code}
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-text",
                issue.severity === "error" ? "bg-danger/10" : "bg-warning/15",
              )}
            >
              <AlertTriangle
                aria-hidden="true"
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  issue.severity === "error" ? "text-danger" : "text-warning",
                )}
              />
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Volume used does not guarantee the remaining space fits another parcel.
      </p>
    </div>
  );
}

export function ParcelInspector({
  parcel,
  quantity,
}: {
  parcel: Parcel | null;
  quantity: number;
}) {
  if (!parcel) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">
        <MousePointerClick aria-hidden="true" className="h-4 w-4 shrink-0" />
        Select a parcel in the 3D view, cargo list or matrix.
      </p>
    );
  }
  const rows: Array<[string, string]> = [
    ["Parcel ID", parcel.id],
    ["Category", CARGO_CATEGORIES[parcel.categoryId]?.name ?? parcel.categoryId],
    ["Dimensions", formatDims(parcel.length, parcel.width, parcel.height)],
    ["Weight", kg(parcel.weight)],
    [
      "Position",
      `x ${parcel.position.x.toFixed(2)} · y ${parcel.position.y.toFixed(2)} · z ${parcel.position.z.toFixed(2)} m`,
    ],
    ["Orientation", parcel.rotationY === 0 ? "As listed" : "Turned 90°"],
    ["Quantity", `${quantity} × ${parcel.code}`],
  ];
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <CategorySwatch categoryId={parcel.categoryId} />
        <span className="text-base font-semibold text-text">{parcel.id}</span>
      </div>
      <dl className="divide-y divide-border">
        {rows.slice(1).map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </dl>
    </div>
  );
}
