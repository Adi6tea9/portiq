"use client";

import * as React from "react";
import { buildUtilizationMatrix } from "@/lib/load-planner/calculations";
import { MATRIX_CELL } from "@/lib/load-planner/config";
import type { ContainerConfig, Parcel } from "@/lib/load-planner/types";
import { cn } from "@/lib/utils";

export interface MatrixLayer {
  bottom: number;
  top: number;
}

export function matrixLayers(
  container: ContainerConfig,
  layerHeight: number,
): MatrixLayer[] {
  const layers: MatrixLayer[] = [];
  for (let bottom = 0; bottom < container.height - 1e-6; bottom += layerHeight) {
    layers.push({ bottom, top: Math.min(container.height, bottom + layerHeight) });
  }
  return layers;
}

const OCCUPIED = "rgb(var(--primary))";
const PARTIAL = "rgb(var(--primary) / 0.35)";
const EMPTY = "rgb(var(--canvas))";
const SELECTED = "#e0a84c";

interface UtilizationMatrixProps {
  container: ContainerConfig;
  parcels: readonly Parcel[];
  layers: readonly MatrixLayer[];
  layerIndex: number;
  onLayerChange: (index: number) => void;
  selected: Parcel | null;
  onSelect: (id: string) => void;
}

export function UtilizationMatrix({
  container,
  parcels,
  layers,
  layerIndex,
  onLayerChange,
  selected,
  onSelect,
}: UtilizationMatrixProps) {
  const layer = layers[layerIndex] ?? layers[0];
  const matrix = React.useMemo(
    () =>
      buildUtilizationMatrix(container, parcels, MATRIX_CELL, layer.bottom, layer.top),
    [container, parcels, layer],
  );
  const showSelected =
    selected &&
    selected.position.y < layer.top &&
    selected.position.y + selected.height > layer.bottom;
  const scale = 1 / MATRIX_CELL;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Height layer">
        {layers.map((item, index) => (
          <button
            key={item.bottom}
            type="button"
            aria-pressed={index === layerIndex}
            onClick={() => onLayerChange(index)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              index === layerIndex
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-text hover:border-primary",
            )}
          >
            {item.bottom.toFixed(1)}–{item.top.toFixed(1)} m
          </button>
        ))}
      </div>

      <div className="flex justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
        <span>Doors</span>
        <span>Front wall</span>
      </div>
      <svg
        viewBox={`0 0 ${matrix.columns} ${matrix.rows}`}
        className="block h-auto w-full rounded-md border border-border"
        role="img"
        aria-label={`Floor occupancy between ${layer.bottom.toFixed(1)} and ${layer.top.toFixed(1)} m: ${Math.round(matrix.occupiedShare * 100)}% of the floor is covered.`}
        onClick={(event) => {
          const id = (event.target as Element).getAttribute("data-parcel");
          if (id) onSelect(id);
        }}
      >
        {matrix.cells.map((cell, index) => (
          <rect
            key={index}
            x={index % matrix.columns}
            y={Math.floor(index / matrix.columns)}
            width={1}
            height={1}
            fill={
              cell.coverage >= 0.95 ? OCCUPIED : cell.coverage > 0.05 ? PARTIAL : EMPTY
            }
            stroke="rgb(var(--surface))"
            strokeWidth={0.08}
            data-parcel={cell.parcelId ?? undefined}
            className={cell.parcelId ? "cursor-pointer" : undefined}
          />
        ))}
        {showSelected && (
          <rect
            x={selected.position.x * scale}
            y={selected.position.z * scale}
            width={selected.length * scale}
            height={selected.width * scale}
            fill={SELECTED}
            fillOpacity={0.55}
            stroke={SELECTED}
            strokeWidth={0.3}
            pointerEvents="none"
          />
        )}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <ul className="flex flex-wrap gap-3">
          {[
            ["Occupied", OCCUPIED],
            ["Partly", PARTIAL],
            ["Free", EMPTY],
            ["Selected", SELECTED],
          ].map(([label, color]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-sm border border-border"
                style={{ background: color }}
              />
              {label}
            </li>
          ))}
        </ul>
        <span className="tabular-nums">
          {Math.round(matrix.occupiedShare * 100)}% floor covered · {MATRIX_CELL * 100} cm
          grid
        </span>
      </div>
    </div>
  );
}
