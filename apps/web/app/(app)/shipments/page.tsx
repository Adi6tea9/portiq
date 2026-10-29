import { ShipmentsList } from "@/components/features/shipments/ShipmentsList";

interface ShipmentsPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function ShipmentsPage({ searchParams }: ShipmentsPageProps) {
  const mockError =
    typeof searchParams.mock_error === "string"
      ? searchParams.mock_error
      : undefined;

  return <ShipmentsList mockError={mockError} />;
}
