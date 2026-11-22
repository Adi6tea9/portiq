"use client";

import { ChevronDown } from "lucide-react";
import { CARGO_CATEGORIES } from "@/lib/load-planner/config";
import type { CargoItem, Parcel } from "@/lib/load-planner/types";
import { cn } from "@/lib/utils";

export function formatDims(l: number, w: number, h: number): string {
  return `${l.toFixed(1)} × ${w.toFixed(1)} × ${h.toFixed(1)} m`;
}

export function CategorySwatch({
  categoryId,
  className,
}: {
  categoryId: string;
  className?: string;
}) {
  const category = CARGO_CATEGORIES[categoryId];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-8 w-8 shrink-0 border border-black/10 shadow-inner",
        category?.shape === "cylinder" ? "rounded-full" : "rounded-md",
        className,
      )}
      style={{ backgroundColor: category?.color }}
    />
  );
}

interface CargoListProps {
  cargo: readonly CargoItem[];
  parcels: readonly Parcel[];
  unplacedIds: readonly string[];
  selectedId: string | null;
  openCode: string | null;
  onOpenChange: (code: string | null) => void;
  onSelect: (id: string) => void;
}

export function CargoList({
  cargo,
  parcels,
  unplacedIds,
  selectedId,
  openCode,
  onOpenChange,
  onSelect,
}: CargoListProps) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {cargo.map((item) => {
        const open = openCode === item.code;
        const placed = parcels.filter((parcel) => parcel.code === item.code);
        const missing = unplacedIds.filter((id) => id.startsWith(`${item.code}-`));
        const panelId = `cargo-${item.code}`;
        return (
          <li key={item.code}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => onOpenChange(open ? null : item.code)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <CategorySwatch categoryId={item.categoryId} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text">
                  {CARGO_CATEGORIES[item.categoryId]?.name ?? item.categoryId} (
                  {item.code})
                </span>
                <span className="block text-xs text-muted">
                  {formatDims(item.length, item.width, item.height)}
                </span>
              </span>
              <span className="text-sm font-medium tabular-nums text-text">
                × {item.quantity}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "h-4 w-4 text-muted transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
            {open && (
              <div id={panelId} className="space-y-2 px-3 pb-3">
                <p className="text-xs text-muted">
                  {item.weight} kg each · {placed.length} placed
                  {missing.length > 0 && (
                    <span className="text-danger"> · {missing.length} not loaded</span>
                  )}
                </p>
                <div
                  className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto"
                  role="group"
                  aria-label={`${item.code} parcels`}
                >
                  {placed.map((parcel) => (
                    <button
                      key={parcel.id}
                      type="button"
                      aria-pressed={parcel.id === selectedId}
                      onClick={() => onSelect(parcel.id)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        parcel.id === selectedId
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-canvas text-text hover:border-primary",
                      )}
                    >
                      {parcel.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
