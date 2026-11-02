"use client";

import { PageState } from "@/components/shared/PageState";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { useShipmentDetail } from "@/lib/api/hooks/useShipmentDetail";
import { EditShipmentForm } from "./EditShipmentForm";

interface EditShipmentPageClientProps {
  id: string;
  mockError?: string;
}

export function EditShipmentPageClient({
  id,
  mockError,
}: EditShipmentPageClientProps) {
  const shipmentQuery = useShipmentDetail({ id, mockError });
  const portsQuery = usePorts();

  if (shipmentQuery.isLoading || portsQuery.isLoading) {
    return <PageState state="loading" />;
  }

  if (shipmentQuery.isError) {
    if (shipmentQuery.error.status === 404) {
      return (
        <PageState
          state="not-found"
          title="Shipment not found"
          message="This shipment doesn't exist or you don't have access to it."
        />
      );
    }

    if (shipmentQuery.error.status === 403) {
      return <PageState state="permission" />;
    }

    return (
      <PageState
        state="error"
        title="Unable to load shipment"
        message={shipmentQuery.error.message}
        requestId={shipmentQuery.error.requestId}
        onRetry={() => void shipmentQuery.refetch()}
      />
    );
  }

  const shipment = shipmentQuery.data;

  if (!shipment) return null;

  if (shipment.status !== "submitted") {
    return (
      <PageState
        state="not-found"
        title="Edit unavailable"
        message="A shipment can only be edited before it arrives."
      />
    );
  }

  const port = portsQuery.data?.find((item) => item.id === shipment.port_id);

  return (
    <EditShipmentForm
      shipment={shipment}
      portTimezone={port?.timezone ?? "UTC"}
      mockError={mockError}
    />
  );
}
