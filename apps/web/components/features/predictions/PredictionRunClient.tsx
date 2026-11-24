"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, StatusPill } from "@/components/shell/PageHeader";
import { useShipmentDetail } from "@/lib/api/hooks/useShipmentDetail";
import { ApiError, createIdempotencyKey } from "@/lib/api/client";
import type { Prediction } from "@/lib/api/types";
import { predictionResultHref, predictionRunHref } from "@/lib/navigation";
import { runPrediction } from "@/lib/shipments/api";
import { PredictionProgress } from "./PredictionProgress";

interface PredictionRunClientProps {
  shipmentId: string;
  /** Idempotency-Key from the URL; one per user click. */
  idempotencyKey?: string;
  mockRunError?: string;
}

interface RunError {
  message: string;
  requestId: string | null;
  retryable: boolean;
}

export function describeRunError(error: unknown): RunError {
  if (!(error instanceof ApiError)) {
    return {
      message: "The prediction could not be completed. Check your connection and try again.",
      requestId: null,
      retryable: true,
    };
  }

  if (error.status === 429) {
    return { message: "Too many requests. Please wait and try again.", requestId: error.requestId, retryable: true };
  }
  if (error.status === 503) {
    return { message: "The prediction service is unavailable. Try again later.", requestId: error.requestId, retryable: true };
  }
  if (error.status === 409 && error.code === "IDEMPOTENCY_CONFLICT") {
    return { message: "This request was already submitted with different details.", requestId: error.requestId, retryable: true };
  }
  if (error.status === 404) {
    return { message: "This shipment doesn't exist or you don't have access to it.", requestId: error.requestId, retryable: false };
  }
  return { message: error.message, requestId: error.requestId, retryable: error.status >= 500 };
}

/**
 * F05 processing page. Sends the prediction request once per Idempotency-Key and
 * replaces itself with the result page, so Back returns to where the run started.
 */
export function PredictionRunClient({ shipmentId, idempotencyKey, mockRunError }: PredictionRunClientProps) {
  const router = useRouter();
  const startedKey = React.useRef<string | null>(null);
  const shipmentQuery = useShipmentDetail({ id: shipmentId });
  const reference = shipmentQuery.data?.reference;

  const mutation = useMutation<Prediction, ApiError, string>({
    mutationFn: (key) => runPrediction(shipmentId, key, mockRunError),
    retry: false,
  });
  const { mutate } = mutation;

  React.useEffect(() => {
    if (!idempotencyKey) {
      router.replace(predictionRunHref(shipmentId, createIdempotencyKey(), mockRunError));
      return;
    }
    // The ref survives React's dev double-mount, so each key is sent once.
    if (startedKey.current === idempotencyKey) return;
    startedKey.current = idempotencyKey;
    mutate(idempotencyKey);
  }, [idempotencyKey, mockRunError, mutate, router, shipmentId]);

  const prediction = mutation.data;
  React.useEffect(() => {
    if (prediction) {
      router.replace(predictionResultHref(shipmentId, prediction.prediction_id));
    }
  }, [prediction, router, shipmentId]);

  // A retry is a new click, so it gets a new key.
  const retry = () => router.replace(predictionRunHref(shipmentId, createIdempotencyKey(), mockRunError));

  const shipmentLink = reference ? (
    <>
      {" "}for{" "}
      <Link href={`/shipments/${shipmentId}`} className="font-medium text-text underline underline-offset-4 hover:text-ocean-teal">
        {reference}
      </Link>
    </>
  ) : null;

  if (mutation.isError) {
    const error = describeRunError(mutation.error);
    return (
      <div className="space-y-section">
        <PageHeader
          icon={Sparkles}
          title="Prediction not completed"
          badges={<StatusPill tone="neutral">Not completed</StatusPill>}
          description={<>The ML model could not produce an estimate{shipmentLink}. Your shipment details are unchanged.</>}
        />
        <Card role="alert" className="flex flex-col items-center gap-4 px-card py-12 text-center">
          <AlertCircle aria-hidden="true" className="size-icon-lg text-danger" />
          <div className="max-w-md space-y-2">
            <p className="text-section-title text-harbor-navy">{error.message}</p>
            <p className="text-sm text-muted">
              {error.retryable
                ? "This is usually temporary. Retrying sends a new request to the model."
                : "Check the shipment, then run the prediction again from its page."}
            </p>
            {error.requestId ? (
              <p className="font-mono text-xs text-muted">Request ID: {error.requestId}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {error.retryable ? (
              <Button type="button" onClick={retry}>
                <RotateCcw aria-hidden="true" />
                Retry prediction
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`/shipments/${shipmentId}`}>
                <ArrowLeft aria-hidden="true" />
                Back to shipment
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/predictions">Back to Predictions</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-section">
      <PageHeader
        icon={Sparkles}
        title="Running prediction"
        badges={<StatusPill tone="neutral">In progress</StatusPill>}
        description={<>Dwell-time and cost estimation by PortIQ’s machine learning model{shipmentLink}.</>}
      />
      <Card>
        <PredictionProgress shipmentReference={reference} />
      </Card>
    </div>
  );
}
