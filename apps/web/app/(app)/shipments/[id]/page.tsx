import { ShipmentDetailClient } from "@/components/features/shipments/ShipmentDetailClient";
import { mockFlagValue } from "@/lib/mocks/flags";

interface ShipmentDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function ShipmentDetailPage({
  params,
  searchParams,
}: ShipmentDetailPageProps) {
  const { id } = await params;

  return (
    <ShipmentDetailClient
      id={id}
      mockError={mockFlagValue(searchParams, "mock_error")}
      eventMockError={mockFlagValue(searchParams, "mock_event_error")}
      runMockError={mockFlagValue(searchParams, "mock_run_error")}
    />
  );
}
