"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Callout } from "@/components/shared/Callout";
import { PageState } from "@/components/shared/PageState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import type { ShipmentDetail, ShipmentStatus } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { useShipmentDetail, usePredictionHistory } from "@/lib/api/hooks/useShipmentDetail";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { useRole } from "@/components/providers/RoleProvider";
import { recordShipmentEvent } from "@/lib/shipments/api";
import { RunPredictionButton } from "@/components/features/predictions/RunPredictionButton";
import {
  humanizeOption,
  isShipmentStatus,
  SHIPMENT_STATUS_OPTIONS,
} from "@/lib/shipments/options";
import { SelectControl, type SelectOption } from "./SelectControl";

interface ShipmentDetailClientProps {
  id: string;
  mockError?: string;
  eventMockError?: string;
  runMockError?: string;
}

const STATUS_OPTIONS: SelectOption[] = SHIPMENT_STATUS_OPTIONS.map((value) => ({
  value,
  label: humanizeOption(value),
}));

function formatDwell(value: number | null, label: string): React.ReactNode {
  if (value === null) return "—";
  return (
    <span>
      <span className="font-medium">{value.toFixed(1)} days</span>
      <span className="text-muted text-sm ml-1">({label})</span>
    </span>
  );
}

function TimelineItem({
  event,
  timezone,
}: {
  event: {
    to_status: ShipmentStatus;
    occurred_at: string;
    recorded_at: string;
    actor_display_name: string | null;
    note: string | null;
  };
  timezone: string;
}) {
  const showRecorded =
    event.recorded_at !== event.occurred_at &&
    new Date(event.recorded_at).getTime() - new Date(event.occurred_at).getTime() >
      60 * 1000;

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      <div className="flex flex-col items-center">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ocean-teal text-xs text-white">
          {event.to_status[0].toUpperCase()}
        </div>
        <div className="w-px h-full bg-border" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-sm font-medium">
          Status changed to <StatusBadge status={event.to_status} />
        </div>
        <p className="text-xs text-muted">
          <DateTime isoTimestamp={event.occurred_at} timezone={timezone} />
          {showRecorded && (
            <span className="ml-1">
              (recorded: <DateTime isoTimestamp={event.recorded_at} timezone={timezone} />)
            </span>
          )}
        </p>
        {event.actor_display_name && (
          <p className="text-xs text-muted">by {event.actor_display_name}</p>
        )}
        {event.note && <p className="text-sm text-muted italic">&ldquo;{event.note}&rdquo;</p>}
      </div>
    </li>
  );
}

function FieldsPanel({
  shipment,
  portName,
  timezone,
}: {
  shipment: ShipmentDetail;
  portName: string;
  timezone: string;
}) {
  const fieldRows = [
    { label: "Reference", value: shipment.reference },
    { label: "Port", value: portName },
    { label: "Direction", value: humanizeOption(shipment.direction) },
    { label: "Cargo type", value: humanizeOption(shipment.cargo_type) },
    { label: "Container size", value: `${shipment.container_size_ft} ft` },
    { label: "HS code", value: shipment.hs_code },
    { label: "Weight", value: `${shipment.weight_kg.toLocaleString("en-IN")} kg` },
    { label: "Declared value", value: <Money amount={shipment.declared_value} /> },
    { label: "Shipping line", value: humanizeOption(shipment.shipping_line) },
    { label: "Vessel size", value: humanizeOption(shipment.vessel_size_band) },
    { label: "Expected arrival", value: <DateTime isoTimestamp={shipment.expected_arrival_at} timezone={timezone} /> },
    { label: "Documentation", value: humanizeOption(shipment.documentation_status) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shipment details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {fieldRows.map((row) => (
            <div key={row.label}>
              <dt className="text-muted">{row.label}</dt>
              <dd className="font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function LatestPredictionCard({
  prediction,
  shipmentId,
  runMockError,
}: {
  prediction: {
    prediction_id: string;
    predicted_dwell_days: number;
    total_estimated_cost: string | null;
    total_is_partial: boolean;
    model_version: string;
    is_demo_data: boolean;
  };
  shipmentId: string;
  runMockError?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Latest prediction</CardTitle>
        {prediction.is_demo_data && <DemoBadge />}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Estimated dwell</span>
          <span className="text-lg font-semibold">
            {prediction.predicted_dwell_days.toFixed(1)} days
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Estimated cost</span>
          <span className="font-medium">
            <Money amount={prediction.total_estimated_cost} />
          </span>
        </div>
        {prediction.total_is_partial && (
          <Callout variant="warning" className="text-xs">
            Indicative total. Some components could not be calculated.
          </Callout>
        )}
        <Button variant="outline" size="sm" asChild className="w-full">
          <Link href={`/shipments/${shipmentId}/prediction/${prediction.prediction_id}`}>
            View prediction
          </Link>
        </Button>
        <RunPredictionButton
          shipmentId={shipmentId}
          runMockError={runMockError}
        />
      </CardContent>
    </Card>
  );
}

function NoPredictionCard({
  shipmentId,
  runMockError,
}: {
  shipmentId: string;
  runMockError?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prediction</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted">No prediction yet.</p>
        <RunPredictionButton
          shipmentId={shipmentId}
          runMockError={runMockError}
        />
      </CardContent>
    </Card>
  );
}

function PredictionHistoryTable({
  shipmentId,
  timezone,
}: {
  shipmentId: string;
  timezone: string;
}) {
  const { data, isLoading, isError, error } = usePredictionHistory({
    shipmentId,
  });

  if (isLoading) return <div className="text-sm text-muted">Loading history...</div>;
  if (isError) return <div className="text-sm text-danger">Failed to load: {error.message}</div>;

  const { history } = data ?? { history: [] };

  if (history.length === 0) {
    return <p className="text-sm text-muted">No prediction history.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 font-medium">Date</th>
            <th className="text-right py-2 font-medium">Dwell (days)</th>
            <th className="text-right py-2 font-medium">Cost</th>
            <th className="text-center py-2 font-medium">Data</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => (
            <tr key={item.prediction_id} className="border-b last:border-0">
              <td className="py-2">
                <DateTime isoTimestamp={item.created_at} timezone={timezone} />
              </td>
              <td className="text-right py-2">{item.predicted_dwell_days.toFixed(1)}</td>
              <td className="text-right py-2">
                {item.total_estimated_cost ? (
                  <Money amount={item.total_estimated_cost} />
                ) : (
                  "—"
                )}
              </td>
              <td className="text-center py-2">
                {item.is_demo_data && <DemoBadge />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictedVsActual({
  predictedDwell,
  actualDwell,
}: {
  predictedDwell: number | null;
  actualDwell: number | null;
}) {
  if (actualDwell === null) return null;

  const diff = predictedDwell !== null ? actualDwell - predictedDwell : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Predicted vs Actual</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="p-3 rounded-lg bg-canvas">
            <p className="text-xs text-muted mb-1">Estimate</p>
            <p className="text-lg font-semibold">
              {predictedDwell !== null ? `${predictedDwell.toFixed(1)} days` : "Unavailable"}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-canvas">
            <p className="text-xs text-muted mb-1">Recorded</p>
            <p className="text-lg font-semibold text-success">{actualDwell.toFixed(1)} days</p>
          </div>
        </div>
        {diff !== null && (
          <p className="text-sm text-center mt-3 text-muted">
            {diff === 0
              ? "Actual matched the estimate."
              : `Actual was ${Math.abs(diff).toFixed(1)} days ${
                  diff > 0 ? "longer" : "shorter"
                } than estimate.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ShipmentDetailClient({
  id,
  mockError,
  eventMockError,
  runMockError,
}: ShipmentDetailClientProps) {
  const router = useRouter();
  const { role } = useRole();
  const query = useShipmentDetail({ id, mockError });
  const portsQuery = usePorts();
  const [eventSheetOpen, setEventSheetOpen] = React.useState(false);
  const [eventSubmitting, setEventSubmitting] = React.useState(false);
  const [eventError, setEventError] = React.useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = React.useState<ShipmentStatus | "">(
    "",
  );

  const shipment = query.data;

  // Determine allowed next status for operators
  const allowedNextStatus: ShipmentStatus | null = React.useMemo(() => {
    if (!shipment) return null;
    if (shipment.status === "submitted") return "arrived";
    if (shipment.status === "arrived") return "cleared";
    return null;
  }, [shipment]);

  const isImporter = role === "importer_exporter";
  const isOperator = role === "port_operator" || role === "platform_admin";
  const canEdit = isImporter && shipment?.status === "submitted";
  const canRecordEvent = isOperator && allowedNextStatus !== null;

  const handleRecordEvent = async () => {
    if (!shipment || !selectedStatus) return;

    setEventSubmitting(true);
    setEventError(null);

    try {
      await recordShipmentEvent(
        id,
        {
          to_status: selectedStatus as ShipmentStatus,
          occurred_at: new Date().toISOString(),
        },
        eventMockError,
      );
      setEventSheetOpen(false);
      setSelectedStatus("");
      query.refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setEventError("That status change is not allowed.");
        } else {
          setEventError(err.message);
        }
      } else {
        setEventError("Something went wrong.");
      }
    } finally {
      setEventSubmitting(false);
    }
  };

  if (query.isLoading) return <PageState state="loading" />;

  if (query.isError) {
    if (query.error.status === 404) {
      return (
        <PageState
          state="not-found"
          title="Shipment not found"
          message="This shipment doesn't exist or you don't have access to it."
        />
      );
    }
    if (query.error.status === 403) {
      return <PageState state="permission" />;
    }
    return (
      <PageState
        state="error"
        title="Unable to load shipment"
        message={query.error.message}
        requestId={query.error.requestId}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!shipment) return null;

  const isCleared = shipment.status === "cleared";
  const port = portsQuery.data?.find((item) => item.id === shipment.port_id);
  const portName = port?.name ?? shipment.port_id;
  const timezone = port?.timezone ?? "UTC";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-harbor-navy">
            {shipment.reference}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={shipment.status} />
            <span className="text-sm text-muted">Port: {portName}</span>
            {shipment.latest_prediction?.is_demo_data && <DemoBadge />}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => router.push(`/shipments/${id}/edit`)}>
              Edit
            </Button>
          )}
          {canRecordEvent && (
            <Sheet open={eventSheetOpen} onOpenChange={setEventSheetOpen}>
              <SheetTrigger asChild>
                <Button>Record event</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Record status change</SheetTitle>
                  <SheetDescription>
                    Record a status change for this shipment.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  {eventError && (
                    <Callout variant="danger">{eventError}</Callout>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New status</label>
                    <SelectControl
                      placeholder="Select status"
                      options={allowedNextStatus ? [STATUS_OPTIONS.find(o => o.value === allowedNextStatus)!] : []}
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value as ShipmentStatus)}
                    />
                    <p className="text-xs text-muted">
                      Current: {humanizeOption(shipment.status)}. Allowed next:{" "}
                      {allowedNextStatus ? humanizeOption(allowedNextStatus) : "none"}.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEventSheetOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleRecordEvent}
                      disabled={!selectedStatus || eventSubmitting}
                      className="flex-1"
                    >
                      {eventSubmitting ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {/* Timeline */}
      {shipment.events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ul>
              {[...shipment.events].reverse().map((event) => (
                <TimelineItem key={event.id} event={event} timezone={timezone} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <FieldsPanel shipment={shipment} portName={portName} timezone={timezone} />

        {shipment.latest_prediction ? (
          <LatestPredictionCard
            prediction={shipment.latest_prediction}
            shipmentId={id}
            runMockError={runMockError}
          />
        ) : (
          <NoPredictionCard shipmentId={id} runMockError={runMockError} />
        )}
      </div>

      {/* Predicted vs Actual (for cleared shipments) */}
      {isCleared && shipment.actual_dwell_days !== null && (
        <PredictedVsActual
          predictedDwell={shipment.latest_prediction?.predicted_dwell_days ?? null}
          actualDwell={shipment.actual_dwell_days}
        />
      )}

      {/* Prediction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prediction history</CardTitle>
        </CardHeader>
        <CardContent>
          <PredictionHistoryTable shipmentId={id} timezone={timezone} />
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Callout variant="info" className="text-xs">
        PortIQ provides planning estimates based on the shipment information, model
        version, capacity assumptions and tariff rules available at the time of
        calculation. Estimates are not an official customs assessment and do not
        promise an operational outcome.
      </Callout>
    </div>
  );
}