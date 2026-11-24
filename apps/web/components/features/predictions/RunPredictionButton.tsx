"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createIdempotencyKey } from "@/lib/api/client";
import { predictionRunHref } from "@/lib/navigation";

interface RunPredictionButtonProps {
  shipmentId: string;
  className?: string;
  runMockError?: string;
  /** Button text when idle. */
  label?: string;
}

/**
 * F05 run control. Each click gets one Idempotency-Key and opens the processing
 * page, which sends the request and shows progress, errors and retry.
 */
export function RunPredictionButton({
  shipmentId,
  className,
  runMockError,
  label = "Run prediction",
}: RunPredictionButtonProps) {
  const router = useRouter();
  const started = React.useRef(false);
  const [starting, setStarting] = React.useState(false);

  const start = () => {
    // The ref guard closes the gap before React disables the button.
    if (started.current) return;
    started.current = true;
    setStarting(true);
    router.push(predictionRunHref(shipmentId, createIdempotencyKey(), runMockError));
  };

  return (
    <div className={className}>
      <Button type="button" onClick={start} loading={starting} className="w-full">
        {starting ? "Starting prediction" : label}
      </Button>
    </div>
  );
}
