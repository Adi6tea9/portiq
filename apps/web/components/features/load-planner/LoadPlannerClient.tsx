"use client";

import * as React from "react";
import { Boxes, Maximize, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { CameraView, ContainerType } from "@/lib/load-planner/types";
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

export function LoadPlannerClient() {
  const [containerType, setContainerType] = React.useState<ContainerType>("20ft");
  const [order, setOrder] = React.useState<ArrangeOrder>("as-listed");
  const [view, setView] = React.useState<CameraView>("perspective");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [layerIndex, setLayerIndex] = React.useState(0);
  const [openCode, setOpenCode] = React.useState<string | null>(null);
  const sceneApi = React.useRef<SceneApi | null>(null);

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
  const layers = React.useMemo(
    () => matrixLayers(container, MATRIX_LAYER_HEIGHT),
    [container],
  );
  const selected = parcels.find((parcel) => parcel.id === selectedId) ?? null;

  const select = React.useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const parcel = id ? parcels.find((item) => item.id === id) : undefined;
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-harbor-navy">
              Container load planning
            </h1>
            <DemoBadge>Sample cargo</DemoBadge>
          </div>
          <p className="text-sm text-muted">
            See how a shipment will sit inside the container before it is packed.
          </p>
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
          <Button
            onClick={() => setOrder("largest-first")}
            aria-pressed={order === "largest-first"}
          >
            <Boxes aria-hidden="true" className="mr-2 h-4 w-4" />
            Auto arrange
          </Button>
        </div>
      </div>

      {/* Phones: 3D view first, then the cards. Desktop: cards in a left column beside the view. */}
      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
        <Card className="xl:col-start-1 xl:row-start-1">
          <CardHeader className="space-y-3 pb-3">
            <CardTitle className="text-base">
              <label htmlFor="container-type">Container</label>
            </CardTitle>
            <SelectControl
              id="container-type"
              value={containerType}
              options={CONTAINER_OPTIONS}
              onChange={(event) => setContainerType(event.target.value as ContainerType)}
            />
            <p className="text-xs text-muted">
              Inside: {container.length.toFixed(2)} × {container.width.toFixed(2)} ×{" "}
              {container.height.toFixed(2)} m
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <h2 className="text-base font-semibold text-text">
              Cargo to load ({SAMPLE_CARGO.reduce((sum, item) => sum + item.quantity, 0)})
            </h2>
            <CargoList
              cargo={SAMPLE_CARGO}
              parcels={parcels}
              unplacedIds={unplacedIds}
              selectedId={selectedId}
              openCode={openCode}
              onOpenChange={setOpenCode}
              onSelect={select}
            />
            <p className="text-xs text-muted">
              {order === "as-listed"
                ? "Loaded in list order from the front wall."
                : "Auto arranged: largest and heaviest first."}{" "}
              A simple placement rule, not an optimiser.
            </p>
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
                <CardTitle className="text-base">Selected parcel</CardTitle>
              </CardHeader>
              <CardContent>
                <ParcelInspector
                  parcel={selected}
                  quantity={
                    SAMPLE_CARGO.find((item) => item.code === selected?.code)?.quantity ??
                    0
                  }
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Floor utilization matrix</CardTitle>
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
            <CardTitle className="text-base">Container utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <UtilizationSummary summary={summary} issues={issues} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
