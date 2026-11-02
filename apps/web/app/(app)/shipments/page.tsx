import { ShipmentsList } from "@/components/features/shipments/ShipmentsList";
import { mockFlagValue } from "@/lib/mocks/flags";

interface ShipmentsPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function ShipmentsPage({ searchParams }: ShipmentsPageProps) {
  return <ShipmentsList mockError={mockFlagValue(searchParams, "mock_error")} />;
}
