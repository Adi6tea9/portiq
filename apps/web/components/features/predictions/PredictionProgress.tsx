import { Loader2 } from "lucide-react";

interface PredictionProgressProps {
  /** Shipment reference, once loaded, so the user knows which run this is. */
  shipmentReference?: string;
}

/**
 * Busy state for a prediction run. The API answers in one request with no
 * intermediate stages, so this shows an indeterminate spinner, not fake steps.
 */
export function PredictionProgress({ shipmentReference }: PredictionProgressProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="app-progress-panel flex flex-col items-center gap-4 px-card py-12 text-center"
    >
      <Loader2 aria-hidden="true" className="size-icon-lg animate-spin text-ocean-teal" />
      <div className="max-w-md space-y-2">
        <p className="text-section-title text-harbor-navy">Running prediction…</p>
        <p className="text-sm text-muted">
          PortIQ is analysing your shipment, cargo and port information using its trained
          machine learning model. This may take a few moments.
        </p>
        {shipmentReference ? (
          <p className="text-sm">
            Shipment <span className="font-medium text-text">{shipmentReference}</span>
          </p>
        ) : null}
        <p className="text-xs text-muted">Keep this page open; you’ll see the results here.</p>
      </div>
    </div>
  );
}
