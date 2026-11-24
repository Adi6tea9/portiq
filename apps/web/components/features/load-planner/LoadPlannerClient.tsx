"use client";

import * as React from "react";
import { Boxes, Maximize, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/shared/InfoTip";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { SelectControl } from "@/components/features/shipments/SelectControl";
import {
  calculateLoadingSummary,
  validatePlacement,
} from "@/lib/load-planner/calculations";
import {
  CONTAINERS,
  CONTAINER_TYPES,
  MATRIX_LAYER_HEIGHT,
  SAMPLE_CARGO,
} from "@/lib/load-planner/config";
import { arrangeCargo, type ArrangeOrder } from "@/lib/load-planner/packing";
import type {
  CameraView,
  CargoItem,
  ContainerConfig,
  ContainerType,
  LoadingSummary,
  Parcel,
  ValidationIssue,
} from "@/lib/load-planner/types";
import { CargoList } from "./CargoList";
import type { SceneApi } from "./ContainerScene";
import { ContainerViewport } from "./ContainerViewport";
import { ParcelInspector, UtilizationSummary } from "./LoadSummaryPanels";
import { UtilizationMatrix, matrixLayers } from "./UtilizationMatrix";
import { ViewStrip } from "./ViewStrip";

const CONTAINER_OPTIONS = CONTAINER_TYPES.map((type) => ({
  value: type,
  label: CONTAINERS[type].label,
}));

export interface PlannerWorkspaceProps {
  title: React.ReactNode;
  subtitle: string;
  actions?: React.ReactNode;
  /** Top of the left card: the container picker or the locked size. */
  containerControl: React.ReactNode;
  container: ContainerConfig;
  parcels: readonly Parcel[];
  unplacedIds: readonly string[];
  summary: LoadingSummary;
  issues: ValidationIssue[];
  /** Cargo lines whose parcels can be selected (never other shipments'). */
  cargo: readonly CargoItem[];
  cargoFooter?: React.ReactNode;
}

/** Shared layout for the sample demo and shipment mode. */
export function PlannerWorkspace({
  title,
  subtitle,
  actions,
  containerControl,
  container,
  parcels,
  unplacedIds,
  summary,
  issues,
  cargo,
  cargoFooter,
}: PlannerWorkspaceProps) {
  const [view, setView] = React.useState<CameraView>("perspective");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [layerIndex, setLayerIndex] = React.useState(0);
  const [openCode, setOpenCode] = React.useState<string | null>(null);
  const sceneApi = React.useRef<SceneApi | null>(null);

  const layers = React.useMemo(
    () => matrixLayers(container, MATRIX_LAYER_HEIGHT),
    [container],
  );
  const selected = parcels.find((parcel) => parcel.id === selectedId) ?? null;
  const selectedLine = cargo.find((item) => item.code === selected?.code);

  const select = React.useCallback(
    (id: string | null) => {
      const parcel = id ? parcels.find((item) => item.id === id) : undefined;
      // Other shipments' parcels are never selectable, from any entry point.
      if (parcel?.locked) return;
      setSelectedId(id);
      if (!parcel) return;
      setOpenCode(parcel.code);
      const index = layers.findIndex((layer) => parcel.position.y < layer.top - 1e-6);
      if (index >= 0) setLayerIndex(index);
    },
    [parcels, layers],
  );

  const resetView = () => {
    if (view === "perspective") sceneApi.current?.fit();
    else setView("perspective");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">{title}</div>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetView}>
            <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
            Reset view
          </Button>
          <Button variant="outline" onClick={() => sceneApi.current?.fit()}>
            <Maximize aria-hidden="true" className="mr-2 h-4 w-4" />
            Fit to container
          </Button>
          {actions}
        </div>
      </div>

      {/* Phones: 3D view first, then the cards. Desktop: cards in a left column beside the view. */}
      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
        <Card className="xl:col-start-1 xl:row-start-1">
          <CardHeader className="space-y-3 pb-3">
            {containerControl}
            <p className="text-xs text-muted">
              Inside: {container.length.toFixed(2)} × {container.width.toFixed(2)} ×{" "}
              {container.height.toFixed(2)} m
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <h2 className="text-base font-semibold text-text">
              Cargo to load ({cargo.reduce((sum, item) => sum + item.quantity, 0)})
              <InfoTip label="cargo to load">Every parcel in the container. Parcels turn only 90° on the floor and are never tipped; fragile or non-stackable ones never carry load.</InfoTip>
            </h2>
            {cargo.length > 0 ? (
              <CargoList
                cargo={cargo}
                parcels={parcels}
                unplacedIds={unplacedIds}
                selectedId={selectedId}
                openCode={openCode}
                onOpenChange={setOpenCode}
                onSelect={select}
              />
            ) : (
              <p className="text-sm text-muted">No cargo in this container yet.</p>
            )}
            {cargoFooter}
          </CardContent>
        </Card>
        <div className="order-first min-w-0 space-y-4 xl:order-none xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <ContainerViewport
            className="h-[56vh] min-h-[320px] sm:h-[480px] xl:h-[600px]"
            container={container}
            parcels={parcels}
            selectedId={selectedId}
            onSelect={select}
            view={view}
            apiRef={sceneApi}
          />
          <ViewStrip view={view} onChange={setView} />
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Selected parcel <InfoTip label="Selected parcel">Details of the parcel you clicked in the 3D view.</InfoTip></CardTitle>
              </CardHeader>
              <CardContent>
                <ParcelInspector
                  parcel={selected}
                  quantity={selectedLine?.quantity ?? selected?.quantity ?? 0}
                  name={selectedLine?.label}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Floor utilization matrix <InfoTip label="Floor utilization matrix">A top-down map of the floor. Darker cells are stacked higher. Use the layer control to look at one level at a time.</InfoTip></CardTitle>
              </CardHeader>
              <CardContent>
                <UtilizationMatrix
                  container={container}
                  parcels={parcels}
                  layers={layers}
                  layerIndex={Math.min(layerIndex, layers.length - 1)}
                  onLayerChange={setLayerIndex}
                  selected={selected}
                  onSelect={select}
                />
              </CardContent>
            </Card>
          </div>
        </div>
        <Card className="xl:col-start-1 xl:row-start-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Container utilization <InfoTip label="Container utilization">How much of the container’s space and payload the packed cargo uses.</InfoTip></CardTitle>
          </CardHeader>
          <CardContent>
            <UtilizationSummary summary={summary} issues={issues} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function LoadPlannerClient() {
  const [containerType, setContainerType] = React.useState<ContainerType>("20ft");
  const [order, setOrder] = React.useState<ArrangeOrder>("as-listed");

  const container = CONTAINERS[containerType];
  const { parcels, unplacedIds } = React.useMemo(
    () => arrangeCargo(container, SAMPLE_CARGO, order),
    [container, order],
  );
  const summary = React.useMemo(
    () => calculateLoadingSummary(container, parcels),
    [container, parcels],
  );
  const issues = React.useMemo(
    () => validatePlacement(container, parcels, unplacedIds),
    [container, parcels, unplacedIds],
  );

  return (
    <PlannerWorkspace
      title={
        <>
          <h1 className="text-2xl font-semibold text-harbor-navy">
            Container load planning
          </h1>
          <DemoBadge>Sample cargo</DemoBadge>
        </>
      }
      subtitle="See how a shipment will sit inside the container before it is packed."
      actions={
        <Button
          onClick={() => setOrder("largest-first")}
          aria-pressed={order === "largest-first"}
        >
          <Boxes aria-hidden="true" className="mr-2 h-4 w-4" />
          Auto arrange
        </Button>
      }
      containerControl={
        <>
          <CardTitle className="text-base">
            <label htmlFor="container-type">Container</label>
          </CardTitle>
          <SelectControl
            id="container-type"
            value={containerType}
            options={CONTAINER_OPTIONS}
            onChange={(event) => setContainerType(event.target.value as ContainerType)}
          />
        </>
      }
      container={container}
      parcels={parcels}
      unplacedIds={unplacedIds}
      summary={summary}
      issues={issues}
      cargo={SAMPLE_CARGO}
      cargoFooter={
        <p className="text-xs text-muted">
          {order === "as-listed"
            ? "Loaded in list order from the front wall."
            : "Auto arranged: largest and heaviest first."}{" "}
          A simple placement rule, not an optimiser.
        </p>
      }
    />
  );
}
