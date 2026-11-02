"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/shared/Callout";
import { ApiError, createIdempotencyKey } from "@/lib/api/client";
import type { Prediction } from "@/lib/api/types";
import { runPrediction } from "@/lib/shipments/api";

interface RunPredictionButtonProps {
  shipmentId: string;
  className?: string;
  runMockError?: string;
}

interface RunError {
  message: string;
  requestId: string | null;
  retryable: boolean;
}

function describeRunError(error: ApiError): RunError {
  if (error.status === 429) {
    return {
      message: "Too many requests. Please wait and try again.",
      requestId: error.requestId,
      retryable: true,
    };
  }

  if (error.status === 503) {
    return {
      message: "The prediction service is unavailable. Try again later.",
      requestId: error.requestId,
      retryable: true,
    };
  }

  if (error.status === 409 && error.code === "IDEMPOTENCY_CONFLICT") {
    return {
      message:
        "This request was already submitted with different details.",
      requestId: error.requestId,
      retryable: true,
    };
  }

  if (error.status === 404) {
    return {
      message:
        "This shipment doesn't exist or you don't have access to it.",
      requestId: error.requestId,
      retryable: false,
    };
  }

  return {
    message: error.message,
    requestId: error.requestId,
    retryable: error.status >= 500,
  };
}

/**
 * F05 run control. One Idempotency-Key UUID is created per user click; a repair
 * click (Retry) is a new click, so it gets its own key.
 */
export function RunPredictionButton({
  shipmentId,
  className,
  runMockError,
}: RunPredictionButtonProps) {
  const router = useRouter();
  const inFlight = React.useRef(false);
  const [error, setError] = React.useState<RunError | null>(null);

  const mutation = useMutation<Prediction, ApiError, string>({
    mutationFn: (idempotencyKey) =>
      runPrediction(shipmentId, idempotencyKey, runMockError),
    retry: false,
    onSuccess: (prediction) => {
      inFlight.current = false;
      router.push(
        `/shipments/${shipmentId}/prediction/${prediction.prediction_id}`,
      );
    },
    onError: (runError) => {
      inFlight.current = false;
      setError(describeRunError(runError));
    },
  });

  const start = () => {
    // The ref guard closes the gap before React disables the button.
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setError(null);
    mutation.mutate(createIdempotencyKey());
  };

  return (
    <div className={className}>
      <Button
        type="button"
        onClick={start}
        disabled={mutation.isPending}
        className="w-full"
      >
        {mutation.isPending ? "Running prediction" : "Run prediction"}
      </Button>

      {error && (
        <div className="mt-3 space-y-2">
          <Callout variant="danger" className="text-xs">
            <p>{error.message}</p>
            {error.requestId && (
              <p className="mt-1 font-mono text-[11px] text-muted">
                Request ID: {error.requestId}
              </p>
            )}
          </Callout>
          {error.retryable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={start}
              disabled={mutation.isPending}
              className="w-full"
            >
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
