import { EditShipmentPageClient } from "@/components/features/shipments/EditShipmentPageClient";
import { mockFlagValue } from "@/lib/mocks/flags";

interface EditShipmentPageProps {
  params: Promise<{ id: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function EditShipmentPage({
  params,
  searchParams,
}: EditShipmentPageProps) {
  const { id } = await params;

  return (
    <EditShipmentPageClient
      id={id}
      mockError={mockFlagValue(searchParams, "mock_error")}
    />
  );
}
