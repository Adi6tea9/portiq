"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Info,
  Lightbulb,
  ListTree,
  Sparkles,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InfoTip } from "@/components/shared/InfoTip";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { PageState } from "@/components/shared/PageState";
import { Callout } from "@/components/shared/Callout";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { ContainerArt } from "@/components/shared/ContainerArt";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { PageHeader, StatusPill } from "@/components/shell/PageHeader";
import { usePrediction } from "@/lib/api/hooks/usePrediction";
import { useConfig } from "@/lib/api/hooks/useConfig";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { useShipmentDetail } from "@/lib/api/hooks/useShipmentDetail";
import { ApiError } from "@/lib/api/client";
import type {
  AppConfig,
  CapacitySnapshot,
  CostLine,
  ExplanationFeature,
  Prediction,
} from "@/lib/api/types";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExplanationChart } from "./ExplanationChart";
import { ExplanationTable, humanizeFeatureName } from "./ExplanationTable";
import { RunPredictionButton } from "./RunPredictionButton";

interface PredictionResultClientProps {
  shipmentId: string;
  predictionId: string;
  mockError?: string;
}

const DISCLAIMER_TEXT =
  "PortIQ provides planning estimates based on the shipment information, model version, capacity assumptions and tariff rules available at the time of calculation. Estimates are not an official customs assessment and do not promise an operational outcome.";

const COST_NOTE =
  "Indicative total; verify against applicable tariffs and carrier terms.";

const PARTIAL_TOTAL_NOTE = "Indicative total. Some components could not be calculated.";

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

function hasExplanation(explanation: Prediction["explanation"]): explanation is NonNullable<
  Prediction["explanation"]
> {
  return (
    !!explanation && explanation.status === "available" && explanation.features.length > 0
  );
}

function byImpact(features: ExplanationFeature[]): ExplanationFeature[] {
  return [...features].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/** Plain-language insights built only from fields the API returned. */
export function keyInsights(
  prediction: Prediction,
  thresholds: AppConfig["capacity_thresholds"] | null,
): string[] {
  const insights: string[] = [];
  const { explanation, capacity_snapshot: capacity, cost_breakdown: costs } = prediction;

  if (hasExplanation(explanation)) {
    const up = byImpact(explanation.features.filter((f) => f.contribution > 0))[0];
    const down = byImpact(explanation.features.filter((f) => f.contribution < 0))[0];
    if (up) {
      insights.push(
        `${humanizeFeatureName(up.name)} (${String(up.value)}) had the largest upward effect, adding ${up.contribution.toFixed(1)} days to the estimate.`,
      );
    }
    if (down) {
      insights.push(
        `${humanizeFeatureName(down.name)} (${String(down.value)}) had the largest downward effect, removing ${Math.abs(down.contribution).toFixed(1)} days.`,
      );
    }
  }

  if (capacity?.status === "available" && typeof capacity.utilization_pct === "number") {
    const label = thresholds ? ` (${thresholdLabel(capacity.utilization_pct, thresholds).toLowerCase()})` : "";
    const resource = capacity.resource_type ? `${humanize(capacity.resource_type).toLowerCase()} ` : "";
    insights.push(
      `Port ${resource}utilization is forecast at ${formatPercent(capacity.utilization_pct)}${label} around the arrival date.`,
    );
  }

  const estimated = costs.filter((line) => line.status === "estimated" && line.amount !== null);
  const largest = [...estimated].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  if (largest?.amount) {
    insights.push(
      `${COST_COMPONENT_LABELS[largest.component]} is the largest cost line at ${formatMoney(largest.amount)}.`,
    );
  }
  const missing = costs.filter((line) => line.status === "unavailable").length;
  if (missing > 0) {
    insights.push(
      `${missing} cost ${missing === 1 ? "component" : "components"} could not be calculated, so the total is incomplete.`,
    );
  }

  for (const warning of prediction.warnings) {
    insights.push(warning.message);
  }

  return insights;
}

function SummaryStrip({
  prediction,
  timezone,
}: {
  prediction: Prediction;
  timezone: string;
}) {
  return (
    <section
      aria-label="Prediction summary"
      className="app-summary-strip grid gap-px overflow-hidden rounded-card sm:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]"
    >
      <div className="hidden items-center justify-center p-4 xl:flex">
        <ContainerArt className="w-full max-w-[220px]" />
      </div>

      <div className="app-summary-cell flex gap-3 p-5">
        <Clock aria-hidden="true" className="mt-0.5 h-6 w-6 flex-shrink-0 text-ocean-teal" />
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text">
            Estimated dwell time
            <InfoTip label="Estimated dwell time">
              The model’s best guess of how many days the container will wait at the port,
              and when it should clear. It is an estimate, not a promise.
            </InfoTip>
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-3xl font-semibold tabular-nums text-harbor-navy">
              {formatDays(prediction.predicted_dwell_days)}
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ocean-teal">
              Estimate
            </span>
          </p>
          <p className="text-sm text-muted">
            Estimated clearance:{" "}
            <DateTime isoTimestamp={prediction.predicted_clearance_at} timezone={timezone} />
          </p>
        </div>
      </div>

      <div className="app-summary-cell flex gap-3 p-5">
        <Coins aria-hidden="true" className="mt-0.5 h-6 w-6 flex-shrink-0 text-ocean-teal" />
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text">
            Estimated total cost
            <InfoTip label="Estimated total cost">{COST_NOTE}</InfoTip>
          </p>
          <p className="text-3xl font-semibold text-harbor-navy">
            {prediction.total_estimated_cost === null ? (
              <span className="text-xl text-muted">Not available</span>
            ) : (
              <span className="tabular-nums">{formatMoney(prediction.total_estimated_cost)}</span>
            )}
          </p>
          <p className="text-sm text-muted">
            {prediction.total_estimated_cost === null
              ? "No cost component could be calculated."
              : prediction.total_is_partial
                ? "Partial total: some components are missing."
                : "All cost components included."}
          </p>
        </div>
      </div>

      <div className="app-summary-cell flex items-center gap-3 p-5 sm:col-span-2 xl:col-span-1">
        <CheckCircle2 aria-hidden="true" className="h-7 w-7 flex-shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-harbor-navy">Prediction completed successfully</p>
          <p className="text-sm text-muted">
            Generated on{" "}
            <DateTime isoTimestamp={prediction.provenance.generated_at} timezone={timezone} />
          </p>
        </div>
      </div>
    </section>
  );
}

function CostCard({ prediction }: { prediction: Prediction }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <SectionTitle
          icon={Coins}
          info={
            <InfoTip label="Cost breakdown">
              Charges worked out from the predicted dwell and the tariffs in force. Days beyond
              the free period add storage and demurrage. Check with your carrier before paying.
            </InfoTip>
          }
        >
          Cost breakdown
        </SectionTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul>
          {prediction.cost_breakdown.map((line) => (
            <li
              key={line.component}
              className="flex items-start justify-between gap-4 border-b border-border py-3 first:pt-0 last:border-0"
            >
              <div className="min-w-0 space-y-1">
                <span className="font-medium">{COST_COMPONENT_LABELS[line.component]}</span>
                {line.rule_version && (
                  <span className="block text-xs text-muted">Rule: {line.rule_version}</span>
                )}
                {line.status === "unavailable" && line.reason && (
                  <span className="block text-xs text-muted">{line.reason}</span>
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

        <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2.5">
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function PredictionDetailsCard({
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
  const title = (
    <SectionTitle
      icon={FileText}
      info={
        <InfoTip label="Prediction details">
          How busy the port is expected to be around your arrival date. High use often means
          longer dwell.
        </InfoTip>
      }
    >
      Prediction details
    </SectionTitle>
  );

  if (!snapshot || snapshot.status === "unavailable") {
    return (
      <Card>
        <CardHeader className="pb-4">{title}</CardHeader>
        <CardContent>
          <p className="text-sm font-medium">Port capacity unavailable</p>
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
      <CardHeader className="pb-4">{title}</CardHeader>
      <CardContent className="space-y-3">
        <dl className="text-sm">
          <DetailRow label="Resource">
            {snapshot.resource_type ? humanize(snapshot.resource_type) : "Unavailable"}
          </DetailRow>
          <DetailRow label="Utilization">
            {typeof utilization === "number" ? (
              <>
                <span className="font-semibold tabular-nums">{formatPercent(utilization)}</span>
                {thresholds ? (
                  <span className="ml-1 text-sm font-normal text-muted">
                    ({thresholdLabel(utilization, thresholds)})
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className="text-muted">Unavailable</span>
                {snapshot.reason && (
                  <span className="block text-xs font-normal text-muted">{snapshot.reason}</span>
                )}
              </>
            )}
          </DetailRow>
          <DetailRow label="Data source">
            {snapshot.source_type ? humanize(snapshot.source_type) : "Unavailable"}
          </DetailRow>
          {snapshot.bucket_start && snapshot.bucket_end && (
            <DetailRow label="Forecast period">
              <DateTime isoTimestamp={snapshot.bucket_start} timezone={timezone} />
              <span aria-hidden="true"> – </span>
              <span className="sr-only">to</span>
              <br aria-hidden="true" />
              <DateTime isoTimestamp={snapshot.bucket_end} timezone={timezone} />
            </DetailRow>
          )}
        </dl>

        {snapshot.source_type === "synthetic" && (
          <p className="text-xs text-muted">Forecast based on synthetic demo data</p>
        )}

        <p className="text-xs text-muted">
          Forecast generated at <DateTime isoTimestamp={generatedAt} timezone={timezone} />
        </p>
      </CardContent>
    </Card>
  );
}

function ExplanationUnavailable({ explanation }: { explanation: Prediction["explanation"] }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <SectionTitle
          icon={BarChart3}
          info={
            <InfoTip label="Prediction analysis">
              The shipment details that pushed the estimate up or down the most. Longer bars had
              a bigger effect.
            </InfoTip>
          }
        >
          Prediction analysis
        </SectionTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium">Explanation unavailable</p>
        <p className="mt-1 text-sm text-muted">
          {explanation?.reason ?? "Explanation unavailable."}
        </p>
      </CardContent>
    </Card>
  );
}

function AnalysisCard({
  explanation,
}: {
  explanation: NonNullable<Prediction["explanation"]>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <SectionTitle
          icon={BarChart3}
          info={
            <InfoTip label="Prediction analysis">
              The shipment details that pushed the estimate up or down the most. Longer bars had
              a bigger effect.
            </InfoTip>
          }
        >
          Prediction analysis
        </SectionTitle>
        <p className="text-sm text-muted">
          How each shipment detail moved the estimate, in days.{" "}
          {explanation.base_value_days !== undefined ? (
            <span>Base value: {formatDays(explanation.base_value_days)}</span>
          ) : null}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ExplanationChart features={explanation.features} />
        <p className="text-xs text-muted">These are model effects, not proof of cause.</p>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ features }: { features: ExplanationFeature[] }) {
  const sorted = React.useMemo(() => byImpact(features), [features]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <SectionTitle icon={Table2}>Detailed feature breakdown</SectionTitle>
        <p className="text-sm text-muted">All {sorted.length} model inputs, largest effect first.</p>
      </CardHeader>
      <CardContent>
        <ExplanationTable features={sorted} />
      </CardContent>
    </Card>
  );
}

function ImportantNotes({ prediction }: { prediction: Prediction }) {
  return (
    <section aria-labelledby="important-notes" className="app-notes-card rounded-card p-5">
      <h2 id="important-notes" className="flex items-center gap-2 text-base font-semibold text-harbor-navy">
        <AlertTriangle aria-hidden="true" className="h-5 w-5 text-warning" />
        Important notes
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {prediction.warnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
            <span>{warning.message}</span>
          </li>
        ))}
        <li className="flex gap-2.5 text-xs leading-relaxed text-muted">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted" />
          <span>{DISCLAIMER_TEXT}</span>
        </li>
      </ul>
    </section>
  );
}

function ProvenanceCard({
  prediction,
  timezone,
}: {
  prediction: Prediction;
  timezone: string;
}) {
  const { provenance } = prediction;

  return (
    <Card>
      <CardHeader className="pb-4">
        <SectionTitle icon={ListTree}>Model and data</SectionTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted">
        <p>Model: {provenance.model_version}</p>
        <p>Dataset: {provenance.dataset_version}</p>
        <p>
          Generated: <DateTime isoTimestamp={provenance.generated_at} timezone={timezone} />
        </p>
        <p>Source: {humanize(provenance.data_source)}</p>
        {provenance.tariff_rule_versions.length > 0 && (
          <p className="text-xs">Tariff rules: {provenance.tariff_rule_versions.join(", ")}</p>
        )}
        {provenance.is_demo_data && <DemoBadge />}
      </CardContent>
    </Card>
  );
}

function WhatItMeans({
  prediction,
  timezone,
}: {
  prediction: Prediction;
  timezone: string;
}) {
  const { explanation } = prediction;
  const total = prediction.total_estimated_cost;

  return (
    <Card>
      <CardHeader className="pb-4">
        <SectionTitle icon={Info}>What it means</SectionTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">
        <p>
          The model expects this container to stay at the port for about{" "}
          <strong>{formatDays(prediction.predicted_dwell_days)}</strong> and to clear around{" "}
          <DateTime isoTimestamp={prediction.predicted_clearance_at} timezone={timezone} />.
        </p>
        {hasExplanation(explanation) ? (
          <p>
            {explanation.base_value_days !== undefined
              ? `It starts from a typical value of ${formatDays(explanation.base_value_days)}. `
              : null}
            Each shipment detail then moves the estimate up or down; the Feature impact section
            shows by how much. These are model effects, not proof of cause.
          </p>
        ) : (
          <p>The model could not explain which details drove this estimate.</p>
        )}
        <p>
          {total === null
            ? "No cost could be calculated for this shipment, so check the charges with your carrier."
            : prediction.total_is_partial
              ? `If the container dwells as estimated, the charges we could calculate come to ${formatMoney(total)}. Some components are missing, so the real total will be higher.`
              : `If the container dwells as estimated, the indicative charges come to ${formatMoney(total)}.`}
        </p>
        <p className="text-muted">
          Use this to plan pickup, storage and cash flow. A longer dwell than expected adds
          storage and demurrage, so recheck the estimate if shipment details change.
        </p>
      </CardContent>
    </Card>
  );
}

function KeyInsights({
  prediction,
  thresholds,
}: {
  prediction: Prediction;
  thresholds: AppConfig["capacity_thresholds"] | null;
}) {
  const insights = keyInsights(prediction, thresholds);

  return (
    <Card>
      <CardHeader className="pb-4">
        <SectionTitle icon={Lightbulb}>Key insights</SectionTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-sm text-muted">No further insights for this prediction.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {insights.map((insight) => (
              <li key={insight} className="flex gap-3 rounded-lg bg-canvas p-3">
                <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-ocean-teal" />
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const SECTIONS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "feature-impact", label: "Feature impact", icon: Sparkles },
  { id: "what-it-means", label: "What it means", icon: Info },
  { id: "key-insights", label: "Key insights", icon: Lightbulb },
] as const;

/** Jump links to the sections below; everything stays on the page. Highlights the section in view. */
function SectionNav() {
  const [active, setActive] = React.useState<string>(SECTIONS[0].id);

  React.useEffect(() => {
    const update = () => {
      // Current = last section whose top has passed under the sticky header and this nav.
      let current: string = SECTIONS[0].id;
      for (const { id } of SECTIONS) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= 160) current = id;
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActive(atBottom ? SECTIONS[SECTIONS.length - 1].id : current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <nav
      aria-label="Prediction sections"
      className="sticky top-header z-20 -mx-gutter overflow-x-auto bg-canvas/95 px-gutter py-2 backdrop-blur"
    >
      <ul className="app-section-nav inline-flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-card">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              onClick={() => setActive(id)}
              className={cn(
                "inline-flex h-control-sm select-none items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-control",
                active === id ? "bg-ocean-teal text-white shadow-sm" : "text-text hover:bg-canvas",
              )}
            >
              <Icon aria-hidden="true" className="size-icon-sm" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ModelAttribution({ prediction }: { prediction: Prediction }) {
  const { model_version, dataset_version, is_demo_data } = prediction.provenance;
  return (
    <div className="app-note-callout flex gap-3 rounded-card p-4 text-sm">
      <Info aria-hidden="true" className="mt-0.5 size-icon-md flex-shrink-0 text-ocean-teal" />
      <p>
        Prediction generated by PortIQ’s machine learning model ({model_version}), trained in-house
        on the {dataset_version} dataset
        {is_demo_data
          ? ": synthetic shipment data calibrated to published port dwell averages."
          : "."}
      </p>
    </div>
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
    predictionQuery.isLoading || shipmentQuery.isLoading || portsQuery.isLoading;

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

  const shipment = shipmentQuery.data;
  const port = portsQuery.data?.find((item) => item.id === shipment?.port_id);
  const timezone = port?.timezone ?? "UTC";
  const thresholds = configQuery.data?.capacity_thresholds ?? null;
  const explanation = prediction.explanation;

  return (
    <div className="space-y-section">
      <PageHeader
        icon={Sparkles}
        title="Prediction results"
        badges={<StatusPill>Completed</StatusPill>}
        description={
          <>
            Dwell-time and cost estimation based on our machine learning model
            {shipment ? (
              <>
                {" "}for{" "}
                <Link
                  href={`/shipments/${shipmentId}`}
                  className="font-medium text-text underline underline-offset-4 hover:text-ocean-teal"
                >
                  {shipment.reference}
                </Link>
              </>
            ) : null}
            .
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/predictions">
                <ArrowLeft aria-hidden="true" />
                Back to Predictions
              </Link>
            </Button>
            <RunPredictionButton shipmentId={shipmentId} label="Run new prediction" />
          </>
        }
      />

      <SummaryStrip prediction={prediction} timezone={timezone} />

      <SectionNav />

      <div className="grid gap-section xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0 space-y-section">
          <section id="overview" aria-label="Overview" className="scroll-mt-36 space-y-section">
            {hasExplanation(explanation) ? (
              <AnalysisCard explanation={explanation} />
            ) : (
              <ExplanationUnavailable explanation={explanation} />
            )}
            <CostCard prediction={prediction} />
          </section>

          <section id="feature-impact" aria-label="Feature impact" className="scroll-mt-36">
            {hasExplanation(explanation) ? (
              <BreakdownCard features={explanation.features} />
            ) : (
              <Card>
                <CardHeader className="pb-4">
                  <SectionTitle icon={Table2}>Detailed feature breakdown</SectionTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted">
                  No feature breakdown for this prediction: the explanation is unavailable (reason
                  under Overview).
                </CardContent>
              </Card>
            )}
          </section>

          <section id="what-it-means" aria-label="What it means" className="scroll-mt-36">
            <WhatItMeans prediction={prediction} timezone={timezone} />
          </section>

          <section id="key-insights" aria-label="Key insights" className="scroll-mt-36">
            <KeyInsights prediction={prediction} thresholds={thresholds} />
          </section>
        </div>

        <aside
          aria-label="Prediction details"
          className="grid min-w-0 content-start gap-section md:grid-cols-2 xl:grid-cols-1"
        >
          <PredictionDetailsCard
            snapshot={prediction.capacity_snapshot}
            thresholds={thresholds}
            timezone={timezone}
            generatedAt={prediction.provenance.generated_at}
          />
          <ModelAttribution prediction={prediction} />
          <ImportantNotes prediction={prediction} />
          <ProvenanceCard prediction={prediction} timezone={timezone} />
        </aside>
      </div>
    </div>
  );
}

