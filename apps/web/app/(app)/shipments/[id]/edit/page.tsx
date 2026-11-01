import { notFound } from "next/navigation";
import { EditShipmentForm } from "@/components/features/shipments/EditShipmentForm";
import { fetchShipmentDetail } from "@/lib/shipments/api";
import { usePorts } from "@/lib/api/hooks/usePorts";

interface EditShipmentPageProps {
  params: Promise<{ id: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

async function getShipmentAndPort(id: string, mockError?: string) {
  const shipment = await fetchShipmentDetail(id, mockError);
  const portsResponse = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/ports${mockError ? `?mock_error=${mockError}` : ""}`,
  );
  const portsData = await portsResponse.json();
  const port = portsData.data.find((p: any) => p.id === shipment.port_id);

  return { shipment, portTimezone: port?.timezone ?? "UTC" };
}

export default async function EditShipmentPage({
  params,
  searchParams,
}: EditShipmentPageProps) {
  const { id } = await params;
  const mockError =
    typeof searchParams.mock_error === "string"
      ? searchParams.mock_error
      : undefined;

  try {
    const { shipment, portTimezone } = await getShipmentAndPort(id, mockError);

    if (shipment.status !== "submitted") {
      notFound();
    }

    return (
      <EditShipmentForm
        shipment={shipment}
        portTimezone={portTimezone}
        mockError={mockError}
      />
    );
  } catch {
    notFound();
  }
}
