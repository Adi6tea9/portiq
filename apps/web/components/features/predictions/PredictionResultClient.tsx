"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageState } from "@/components/shared/PageState";
import { Callout } from "@/components/shared/Callout";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { usePrediction } from "@/lib/api/hooks/usePrediction";
import { useConfig } from "@/lib/api/hooks/useConfig";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { useShipmentDetail } from "@/lib/api/hooks/useShipmentDetail";
import { ApiError } from "@/lib/api/client";
import type {
  AppConfig,
  CapacitySnapshot,
  CostLine,
  Prediction,
  Warning,
} from "@/lib/api/types";
import { formatDays, formatPercent } from "@/lib/format";
import { ExplanationChart } from "./ExplanationChart";
import { ExplanationTable } from "./ExplanationTable";

interface PredictionResultClientProps {
  shipmentId: string;
  predictionId: string;
  mockError?: string;
}

const DISCLAIMER_TEXT =
  "PortIQ provides planning estimates based on the shipment information, model version, capacity assumptions and tariff rules available at the time of calculation. Estimates are not an official customs assessment and do not promise an operational outcome.";

const COST_NOTE =
  "Indicative total; verify against applicable tariffs and carrier terms.";

const PARTIAL_TOTAL_NOTE =
  "Indicative total. Some components could not be calculated.";

const COST_COMPONENT_LABELS: Record<CostLine["component"], string> = {
  customs_duty: "Customs duty",
  port_storage: "Port storage",
  demurrage: "Demurrage",
  other_charge: "Other charges",
};

function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function thresholdLabel(
  utilizationPct: number,
  thresholds: AppConfig["capacity_thresholds"],
): string {
  if (utilizationPct >= thresholds.high_pct) {
    return "High utilization";
  }
  if (utilizationPct >= thresholds.moderate_pct) {
    return "Moderate utilization";
  }
  return "Lower utilization";
}

function HeadlineCard({
  prediction,
  timezone,
}: {
  prediction: Prediction;
  timezone: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Prediction result</CardTitle>
        <Badge variant="outline" className="text-xs">
          Estimate
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-2xl font-semibold text-harbor-navy">
          Estimated dwell time: {formatDays(prediction.predicted_dwell_days)}
        </p>
        <p className="text-base">
          <span className="text-muted">Estimated clearance: </span>
          <DateTime
            isoTimestamp={prediction.predicted_clearance_at}
            timezone={timezone}
          />
        </p>
      </CardContent>
    </Card>
  );
}

function CostCard({
  prediction,
}: {
  prediction: Prediction;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {prediction.cost_breakdown.map((line) => (
            <li
              key={line.component}
              className="flex items-start justify-between gap-4 border-b py-2 last:border-0"
            >
              <div className="space-y-1">
                <span className="font-medium">
                  {COST_COMPONENT_LABELS[line.component]}
                </span>
                {line.rule_version && (
                  <span className="block text-xs text-muted">
                    Rule: {line.rule_version}
                  </span>
                )}
                {line.status === "unavailable" && line.reason && (
                  <span className="block text-xs text-muted">
                    {line.reason}
                  </span>
                )}
              </div>
              <span className="text-right">
                {line.status === "estimated" ? (
                  <Money amount={line.amount} />
                ) : (
                  <Money amount={null} />
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t pt-2">
          <span className="font-semibold">Total</span>
          <span className="font-semibold">
            <Money amount={prediction.total_estimated_cost} />
          </span>
        </div>

        {prediction.total_is_partial && (
          <Callout variant="warning" className="text-xs">
            {PARTIAL_TOTAL_NOTE}
          </Callout>
        )}

        <p className="text-xs text-muted">{COST_NOTE}</p>
        <p className="text-xs text-muted">{DISCLAIMER_TEXT}</p>
      </CardContent>
    </Card>
  );
}

function CapacityCard({
  snapshot,
  thresholds,
  timezone,
  generatedAt,
}: {
  snapshot: CapacitySnapshot | null;
  thresholds: AppConfig["capacity_thresholds"] | null;
  timezone: string;
  generatedAt: string;
}) {
  if (!snapshot || snapshot.status === "unavailable") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Port capacity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">Unavailable</p>
          <p className="mt-1 text-sm text-muted">
            {snapshot?.reason ?? "Capacity information unavailable."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const utilization = snapshot.utilization_pct;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Port capacity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted">Resource</dt>
            <dd className="text-right font-medium">
              {snapshot.resource_type
                ? humanize(snapshot.resource_type)
                : "Unavailable"}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted">Utilization</dt>
            <dd className="text-right">
              {typeof utilization === "number" ? (
                <>
                  <span className="font-semibold tabular-nums">
                    {formatPercent(utilization)}
                  </span>
                  {thresholds ? (
                    <span className="ml-2 text-sm text-muted">
                      ({thresholdLabel(utilization, thresholds)})
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="text-muted">Unavailable</span>
                  {snapshot.reason && (
                    <span className="block text-xs text-muted">
                      {snapshot.reason}
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted">Data source</dt>
            <dd className="text-right font-medium">
              {snapshot.source_type
                ? humanize(snapshot.source_type)
                : "Unavailable"}
            </dd>
          </div>
          {snapshot.bucket_start && snapshot.bucket_end && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted">Forecast bucket</dt>
              <dd className="text-right">
                <DateTime
                  isoTimestamp={snapshot.bucket_start}
                  timezone={timezone}
                />
                <span aria-hidden="true"> – </span>
                <span className="sr-only">to</span>
                <DateTime
                  isoTimestamp={snapshot.bucket_end}
                  timezone={timezone}
                />
              </dd>
            </div>
          )}
        </dl>

        {snapshot.source_type === "synthetic" && (
          <p className="text-xs text-muted">
            Forecast based on synthetic demo data
          </p>
        )}

        <p className="text-xs text-muted">
          Forecast generated at{" "}
          <DateTime isoTimestamp={generatedAt} timezone={timezone} />
        </p>
      </CardContent>
    </Card>
  );
}

function ExplanationCard({
  explanation,
}: {
  explanation: Prediction["explanation"];
}) {
  const unavailableReason =
    explanation?.reason ?? "Explanation unavailable.";

  if (
    !explanation ||
    explanation.status === "unavailable" ||
    explanation.features.length === 0
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            What influenced this prediction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">Unavailable</p>
          <p className="mt-1 text-sm text-muted">{unavailableReason}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          What influenced this prediction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {explanation.base_value_days !== undefined && (
          <p className="text-sm text-muted">
            Base value: {formatDays(explanation.base_value_days)}
          </p>
        )}

        <ExplanationChart features={explanation.features} />
        <ExplanationTable features={explanation.features} />

        <p className="text-xs text-muted">
          These are model effects, not proof of cause.
        </p>
      </CardContent>
    </Card>
  );
}

function WarningsSection({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {warnings.map((warning, index) => (
        <Callout
          key={`${warning.code}-${index}`}
          variant="warning"
          className="text-sm"
        >
          {warning.message}
        </Callout>
      ))}
    </div>
  );
}

function ProvenanceFooter({
  prediction,
  timezone,
}: {
  prediction: Prediction;
  timezone: string;
}) {
  const { provenance } = prediction;

  return (
    <Card className="border-none bg-canvas">
      <CardContent className="space-y-2 py-4 text-sm text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>Model: {provenance.model_version}</span>
          <span>Dataset: {provenance.dataset_version}</span>
          <span>
            Generated:{" "}
            <DateTime
              isoTimestamp={provenance.generated_at}
              timezone={timezone}
            />
          </span>
          <span>Source: {humanize(provenance.data_source)}</span>
          {provenance.is_demo_data && <DemoBadge />}
        </div>
        {provenance.tariff_rule_versions.length > 0 && (
          <p className="text-xs">
            Tariff rules: {provenance.tariff_rule_versions.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function PredictionResultClient({
  shipmentId,
  predictionId,
  mockError,
}: PredictionResultClientProps) {
  const predictionQuery = usePrediction({
    shipmentId,
    predictionId,
    mockError,
  });
  const shipmentQuery = useShipmentDetail({ id: shipmentId, mockError });
  const portsQuery = usePorts();
  const configQuery = useConfig();

  const isLoading =
    predictionQuery.isLoading ||
    shipmentQuery.isLoading ||
    portsQuery.isLoading;

  if (isLoading) {
    return <PageState state="loading" />;
  }

  if (predictionQuery.isError) {
    const error = predictionQuery.error;

    if (error instanceof ApiError) {
      if (error.status === 404) {
        return (
          <PageState
            state="not-found"
            title="Prediction not found"
            message="This prediction doesn't exist or you don't have access to it."
          />
        );
      }

      if (error.status === 403) {
        return <PageState state="permission" />;
      }

      return (
        <PageState
          state="error"
          title="Unable to load prediction"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void predictionQuery.refetch()}
        />
      );
    }

    return (
      <PageState
        state="error"
        title="Unable to load prediction"
        message="Something went wrong."
        onRetry={() => void predictionQuery.refetch()}
      />
    );
  }

  const prediction = predictionQuery.data;

  if (!prediction) {
    return null;
  }

  const port = portsQuery.data?.find(
    (item) => item.id === shipmentQuery.data?.port_id,
  );
  const timezone = port?.timezone ?? "UTC";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-harbor-navy">
          Prediction result
        </h1>
        <Button variant="outline" asChild>
          <Link href={`/shipments/${shipmentId}`}>Back to shipment</Link>
        </Button>
      </div>

      {/* 1. Headline */}
      <HeadlineCard prediction={prediction} timezone={timezone} />

      {/* 2. Cost */}
      <CostCard prediction={prediction} />

      {/* 3. Capacity */}
      <CapacityCard
        snapshot={prediction.capacity_snapshot}
        thresholds={configQuery.data?.capacity_thresholds ?? null}
        timezone={timezone}
        generatedAt={prediction.provenance.generated_at}
      />

      {/* 4. What influenced this */}
      <ExplanationCard explanation={prediction.explanation} />

      {/* 5. Warnings */}
      <WarningsSection warnings={prediction.warnings} />

      {/* 6. Provenance */}
      <ProvenanceFooter prediction={prediction} timezone={timezone} />

      {/* 7. Disclaimer */}
      <Callout variant="info" className="text-xs">
        {DISCLAIMER_TEXT}
      </Callout>
    </div>
  );
}
