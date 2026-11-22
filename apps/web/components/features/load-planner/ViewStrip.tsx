"use client";

import type { CameraView } from "@/lib/load-planner/types";
import { VIEW_ORDER, VIEW_PRESETS } from "@/lib/load-planner/views";
import { cn } from "@/lib/utils";

const GREEN = "rgb(var(--primary))";
const CARGO = "#c9a06b";

// Small line drawings of each camera angle; decorative, the label carries the meaning.
const SKETCHES: Record<CameraView, JSX.Element> = {
  perspective: (
    <>
      <path d="M6 14 L20 6 L58 6 L44 14 Z" fill={GREEN} opacity={0.7} />
      <path d="M44 14 L58 6 L58 22 L44 30 Z" fill={GREEN} opacity={0.85} />
      <rect x={6} y={14} width={38} height={16} fill={GREEN} />
      <rect x={9} y={17} width={10} height={10} fill={CARGO} />
    </>
  ),
  side: (
    <>
      <rect x={4} y={8} width={56} height={20} rx={1} fill={GREEN} />
      {[12, 20, 28, 36, 44, 52].map((x) => (
        <line
          key={x}
          x1={x}
          y1={10}
          x2={x}
          y2={26}
          stroke="#ffffff"
          strokeOpacity={0.25}
        />
      ))}
    </>
  ),
  front: (
    <>
      <rect x={18} y={5} width={28} height={26} rx={1} fill={GREEN} />
      <rect x={21} y={8} width={22} height={20} fill={CARGO} opacity={0.9} />
      <line x1={32} y1={8} x2={32} y2={28} stroke={GREEN} strokeWidth={1.5} />
    </>
  ),
  rear: (
    <>
      <rect x={18} y={5} width={28} height={26} rx={1} fill={GREEN} />
      {[24, 30, 36, 42].map((x) => (
        <line
          key={x}
          x1={x}
          y1={7}
          x2={x}
          y2={29}
          stroke="#ffffff"
          strokeOpacity={0.25}
        />
      ))}
    </>
  ),
  top: (
    <>
      <rect x={4} y={9} width={56} height={18} rx={1} fill={GREEN} />
      <rect x={7} y={12} width={50} height={12} fill={CARGO} opacity={0.85} />
      <line x1={24} y1={12} x2={24} y2={24} stroke={GREEN} />
      <line x1={40} y1={12} x2={40} y2={24} stroke={GREEN} />
    </>
  ),
  interior: (
    <>
      <path d="M4 4 L60 4 L46 12 L18 12 Z" fill={GREEN} opacity={0.6} />
      <path d="M4 32 L60 32 L46 24 L18 24 Z" fill="#a8743f" opacity={0.7} />
      <rect x={18} y={12} width={28} height={12} fill={CARGO} />
    </>
  ),
};

export function ViewStrip({
  view,
  onChange,
}: {
  view: CameraView;
  onChange: (view: CameraView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Camera view"
      className="grid grid-cols-3 gap-2 sm:grid-cols-6"
    >
      {VIEW_ORDER.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={item === view}
          onClick={() => onChange(item)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border bg-surface px-2 py-2.5 text-xs font-medium text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            item === view
              ? "border-primary ring-1 ring-primary"
              : "border-border hover:border-primary/60",
          )}
        >
          <svg viewBox="0 0 64 36" className="h-8 w-14" aria-hidden="true">
            {SKETCHES[item]}
          </svg>
          {VIEW_PRESETS[item].label}
        </button>
      ))}
    </div>
  );
}
