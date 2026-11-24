"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTipProps {
  /** What the tip explains; becomes the button's accessible name "About <label>". */
  label: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Small "i" button that explains a field or card. Opens on hover, focus and
 * click/tap; Escape or a click outside closes it. Click pins it open so touch works.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const id = React.useId();
  const [hovered, setHovered] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const open = hovered || pinned || focused;

  React.useEffect(() => {
    if (!open) return;
    const close = () => {
      setHovered(false);
      setPinned(false);
      setFocused(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex align-middle", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-text shadow-md"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
