"use client";

import * as React from "react";
import { predictionResultHref } from "@/lib/navigation";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageState } from "@/components/shared/PageState";
import { Callout } from "@/components/shared/Callout";
import { DateTime } from "@/components/shared/DateTime";
import { Money } from "@/components/shared/Money";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader, StatusPill } from "@/components/shell/PageHeader";
import { useMe } from "@/components/providers/MeProvider";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { useShipments } from "@/lib/api/hooks/useShipments";
import { useOperatorShipments } from "@/lib/api/hooks/useOperatorShipments";
import type { ApiError } from "@/lib/api/client";
import type { Pagination, Port, Shipment } from "@/lib/api/types";
import { formatDays } from "@/lib/format";

export const PREDICTIONS_PAGE_SIZE = 10;

interface PageResult {
  shipments: Shipment[];
  pagination: Pagination | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: ApiError | null;
  refetch: () => void;
}

function useImporterRuns(page: number): PageResult {
  const query = useShipments({ page, pageSize: PREDICTIONS_PAGE_SIZE });
  return {
    shipments: query.data?.shipments ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

function useOperatorRuns(page: number): PageResult {
  const query = useOperatorShipments({ page, pageSize: PREDICTIONS_PAGE_SIZE });
  return {
    shipments: query.data?.rows.map((row) => row.shipment) ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

export function PredictionsClient() {
  const { role } = useMe();

  if (!role) {
    return <PageState state="loading" />;
  }

  return role === "port_operator" ? <OperatorPredictions /> : <ImporterPredictions />;
}

function ImporterPredictions() {
  const [page, setPage] = React.useState(1);
  return <PredictionsView result={useImporterRuns(page)} onPageChange={setPage} />;
}

function OperatorPredictions() {
  const [page, setPage] = React.useState(1);
  return <PredictionsView result={useOperatorRuns(page)} onPageChange={setPage} />;
}

function PredictionsView({
  result,
  onPageChange,
}: {
  result: PageResult;
  onPageChange: (page: number) => void;
}) {
  const portsQuery = usePorts();
  const ports = portsQuery.data ?? [];
  const { shipments, pagination, isLoading, isFetching, error, refetch } = result;
  const withRuns = shipments.filter((shipment) => shipment.latest_prediction).length;
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.page_size))
    : 1;

  return (
    <div className="space-y-section">
      <PageHeader
        icon={Sparkles}
        title="Predictions"
        badges={<StatusPill>ML</StatusPill>}
        description="The latest dwell-time and cost prediction for each shipment you can see. Open a prediction for the full breakdown and what influenced it."
      />

      <Callout variant="info">
        Each shipment keeps its full prediction history on its own page. To run a new
        prediction, open the shipment and choose <strong>Run prediction</strong>.
      </Callout>

      {isLoading ? (
        <PageState state="loading" />
      ) : error ? (
        error.status === 403 ? (
          <PageState state="permission" />
        ) : (
          <PageState
            state="error"
            title="Unable to load predictions"
            message={error.message}
            requestId={error.requestId}
            onRetry={refetch}
          />
        )
      ) : shipments.length === 0 ? (
        <Card>
          <PageState
            state="empty"
            title="No shipments yet"
            message="Predictions appear here once a shipment exists and a prediction has been run."
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <p>
                {withRuns} of {shipments.length} shipments on this page have a prediction
              </p>
              <p role="status" aria-live="polite">
                {isFetching ? "Updating…" : ""}
              </p>
            </div>
            <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-busy={isFetching}>
              <table className="app-table-grid w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Latest prediction per shipment</caption>
                <thead className="border-b border-border bg-canvas text-xs text-text">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-semibold">Shipment</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Estimated dwell
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Estimated total cost
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">Generated</th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shipments.map((shipment) => (
                    <PredictionRow key={shipment.id} shipment={shipment} ports={ports} />
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.total > pagination.page_size ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1 || isFetching}
                >
                  Previous
                </Button>
                <p className="text-sm text-muted">
                  Page {pagination.page} of {totalPages}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(Math.min(totalPages, pagination.page + 1))}
                  disabled={pagination.page >= totalPages || isFetching}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PredictionRow({ shipment, ports }: { shipment: Shipment; ports: Port[] }) {
  const run = shipment.latest_prediction;
  const port = ports.find((item) => item.id === shipment.port_id);

  return (
    <tr>
      <td className="px-3 py-3">
        <Link
          href={`/shipments/${shipment.id}`}
          className="font-medium text-harbor-navy underline-offset-4 hover:underline"
        >
          {shipment.reference}
        </Link>
        <span className="block text-xs text-muted">{port?.name ?? shipment.port_id}</span>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={shipment.status} />
      </td>
      {run ? (
        <>
          <td className="px-3 py-3 text-right font-semibold tabular-nums">
            {formatDays(run.predicted_dwell_days)}
          </td>
          <td className="px-3 py-3 text-right">
            <Money amount={run.total_estimated_cost} />
            {run.total_is_partial && run.total_estimated_cost !== null ? (
              <span className="block text-xs text-muted">Partial total</span>
            ) : null}
          </td>
          <td className="px-3 py-3">
            <DateTime isoTimestamp={run.created_at} timezone={port?.timezone ?? "UTC"} />
            <span className="block text-xs text-muted">
              {run.model_version}
              {run.is_demo_data ? " · demo data" : ""}
            </span>
          </td>
          <td className="px-3 py-3 text-right">
            <Button asChild size="sm" variant="outline">
              <Link href={predictionResultHref(shipment.id, run.prediction_id)}>
                View results
                <span className="sr-only"> for {shipment.reference}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </td>
        </>
      ) : (
        <>
          <td colSpan={3} className="px-3 py-3 text-muted">
            No prediction yet
          </td>
          <td className="px-3 py-3 text-right">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/shipments/${shipment.id}`}>
                Open shipment
                <span className="sr-only"> {shipment.reference}</span>
              </Link>
            </Button>
          </td>
        </>
      )}
    </tr>
  );
}
