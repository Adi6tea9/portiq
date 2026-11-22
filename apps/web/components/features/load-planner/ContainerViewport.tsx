"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Box, Hand, Rotate3d, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContainerSceneProps, SceneApi } from "./ContainerScene";

// three.js (~600 KB) only downloads when this viewport mounts, never on other pages.
const ContainerScene = dynamic(() => import("./ContainerScene"), {
  ssr: false,
  loading: () => <Poster label="Loading 3D view…" />,
});

function Poster({ label, tone = "muted" }: { label: string; tone?: "muted" | "danger" }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static decorative cut-out, already optimised */}
      <img
        src="/themes/portiq/portiq-container.webp"
        alt=""
        width={900}
        height={518}
        className="w-3/5 max-w-sm opacity-90 drop-shadow-xl"
      />
      <p
        role="status"
        className={cn("text-sm", tone === "danger" ? "text-danger" : "text-muted")}
      >
        {label}
      </p>
    </div>
  );
}

class SceneBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <Poster
        tone="danger"
        label="The 3D view could not start on this device. The cargo list, matrix and summary still work."
      />
    ) : (
      this.props.children
    );
  }
}

function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed
          ? "border-primary bg-primary text-white"
          : "border-border bg-surface text-text hover:bg-canvas",
      )}
    >
      {children}
    </button>
  );
}

export type ContainerViewportProps = Omit<
  ContainerSceneProps,
  "panMode" | "reducedMotion" | "apiRef" | "cutaway"
> & {
  apiRef: React.MutableRefObject<SceneApi | null>;
  className?: string;
};

export function ContainerViewport({
  apiRef,
  className,
  ...sceneProps
}: ContainerViewportProps) {
  const [panMode, setPanMode] = React.useState(false);
  const [cutaway, setCutaway] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      className={cn(
        "app-planner-stage relative overflow-hidden rounded-2xl border border-border",
        className,
      )}
      role="region"
      aria-label="3D container view. Drag to rotate, Ctrl or Command and scroll, or pinch, to zoom."
    >
      <SceneBoundary>
        <ContainerScene
          {...sceneProps}
          cutaway={cutaway}
          panMode={panMode}
          reducedMotion={reducedMotion}
          apiRef={apiRef}
        />
      </SceneBoundary>
      <p className="pointer-events-none absolute left-3 top-3 hidden rounded-full bg-surface/80 px-2.5 py-1 text-[11px] text-muted sm:block">
        Drag to rotate · Ctrl/⌘ + scroll to zoom
      </p>
      <div
        role="toolbar"
        aria-label="3D view controls"
        className="absolute inset-x-0 bottom-3 flex justify-center gap-2 px-3"
      >
        <ToolButton
          label="Rotate with drag"
          pressed={!panMode}
          onClick={() => setPanMode(false)}
        >
          <Rotate3d aria-hidden="true" className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="Pan with drag"
          pressed={panMode}
          onClick={() => setPanMode(true)}
        >
          <Hand aria-hidden="true" className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Zoom in" onClick={() => apiRef.current?.zoom(1)}>
          <ZoomIn aria-hidden="true" className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Zoom out" onClick={() => apiRef.current?.zoom(-1)}>
          <ZoomOut aria-hidden="true" className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="Cut away side wall and roof"
          pressed={cutaway}
          onClick={() => setCutaway((on) => !on)}
        >
          <Box aria-hidden="true" className="h-5 w-5" />
        </ToolButton>
      </div>
    </div>
  );
}
