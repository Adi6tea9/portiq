"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageState } from "@/components/shared/PageState";
import { SelectControl } from "@/components/features/shipments/SelectControl";
import { useMe } from "@/components/providers/MeProvider";
import { useShipmentDetail } from "@/lib/api/hooks/useShipmentDetail";
import { useCargo, useLoadPlan, useLoadPlanStream } from "@/lib/api/hooks/useLoadPlan";
import { validatePlacement } from "@/lib/load-planner/calculations";
import {
  containerConfigFor,
  emptyPlanContainer,
  summaryFor,
  toEngineCargo,
  toEngineParcels,
} from "@/lib/load-planner/shipment";
import { CargoPanel } from "./CargoPanel";
import { PlannerWorkspace } from "./LoadPlannerClient";

/** Shipment mode: real cargo, packed by the server, refreshed live. */
export function ShipmentLoadPlanner({ shipmentId }: { shipmentId: string }) {
  // The signed-in account's role; RoleProvider only tracks the mock role switcher.
  const { role } = useMe();
  const shipmentQuery = useShipmentDetail({ id: shipmentId });
  const planQuery = useLoadPlan(shipmentId);
  const cargoQuery = useCargo(shipmentId);
  const { connected } = useLoadPlanStream(shipmentId);
  const [sequence, setSequence] = React.useState<number | null>(null);

  const shipment = shipmentQuery.data;
  const containers = planQuery.data?.containers ?? [];
  const size = shipment?.container_size_ft ?? 20;
  const empty = React.useMemo(() => emptyPlanContainer(size), [size]);
  const plan = containers.find((c) => c.sequence === sequence) ?? containers[0] ?? empty;

  const container = React.useMemo(() => containerConfigFor(plan), [plan]);
  const parcels = React.useMemo(() => toEngineParcels(plan), [plan]);
  const summary = React.useMemo(() => summaryFor(plan, container), [plan, container]);
  const unplacedIds = React.useMemo(
    () => Array.from({ length: plan.unplaced_count }, (_, i) => `unplaced-${i}`),
    [plan.unplaced_count],
  );
  const issues = React.useMemo(
    () => validatePlacement(container, parcels, unplacedIds),
    [container, parcels, unplacedIds],
  );
  const cargoData = cargoQuery.data;
  const containerCargo = React.useMemo(
    () =>
      toEngineCargo(
        (cargoData ?? []).filter((item) => plan.id === null || item.container_id === plan.id),
      ),
    [cargoData, plan.id],
  );

  if (shipmentQuery.isPending || planQuery.isPending) return <PageState state="loading" />;
  if (shipmentQuery.error || planQuery.error || !shipment) {
    const error = shipmentQuery.error ?? planQuery.error;
    return error?.status === 404 ? (
      <PageState state="not-found" title="Shipment not found" />
    ) : (
      <PageState
        state="error"
        message={error?.message}
        requestId={error?.requestId}
        onRetry={() => {
          void shipmentQuery.refetch();
          void planQuery.refetch();
        }}
      />
    );
  }

  const editable = role === "importer_exporter" && shipment.status === "submitted";

  return (
    <PlannerWorkspace
      title={
        <>
          Load plan for{" "}
          <Link href={`/shipments/${shipment.id}`} className="underline-offset-4 hover:underline">
            {shipment.reference}
          </Link>
        </>
      }
      actions={
        <Button variant="outline" asChild>
          <Link href={`/shipments/${shipment.id}`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to shipment
          </Link>
        </Button>
      }
      badges={
        <>
          <Badge variant="outline">
            {shipment.booking_type === "shared" ? "Shared container" : "Full container"}
          </Badge>
          {connected && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-success" role="status">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
              Live
            </span>
          )}
        </>
      }
      subtitle={
        planQuery.data?.viewer_sees_all
          ? "Packed automatically. As port staff you can see every shipment's cargo here."
          : shipment.booking_type === "shared"
            ? "Packed automatically. Grey blocks are other shipments' cargo."
            : "Packed automatically from your cargo lines."
      }
      containerControl={
        <>
          <CardTitle className="text-base">
            {containers.length > 1 ? (
              <label htmlFor="plan-container">Container</label>
            ) : (
              `Container ${plan.sequence} · ${plan.container_size_ft} ft`
            )}
          </CardTitle>
          {containers.length > 1 && (
            <SelectControl
              id="plan-container"
              value={String(plan.sequence)}
              options={containers.map((c) => ({
                value: String(c.sequence),
                label: `Container ${c.sequence} · ${c.container_size_ft} ft`,
              }))}
              onChange={(event) => setSequence(Number(event.target.value))}
            />
          )}
          <p className="text-xs text-muted">Size set by the shipment.</p>
        </>
      }
      container={container}
      parcels={parcels}
      unplacedIds={unplacedIds}
      summary={summary}
      issues={issues}
      cargo={containerCargo}
      cargoFooter={<CargoPanel shipment={shipment} cargo={cargoData ?? []} editable={editable} />}
    />
  );
}
