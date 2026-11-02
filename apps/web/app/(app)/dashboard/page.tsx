import { DashboardClient } from "@/components/features/dashboard/DashboardClient";
import { mockFlag, mockFlagValue } from "@/lib/mocks/flags";

interface DashboardPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  const mockEmpty = mockFlag(searchParams, "mock_empty");
  const mockCapacityError = mockFlagValue(searchParams, "mock_capacity_error");
  const mockLatestShipment = mockFlagValue(searchParams, "mock_latest_shipment");

  return (
    <DashboardClient
      mockEmpty={mockEmpty}
      mockCapacityError={mockCapacityError}
      mockLatestShipment={mockLatestShipment}
    />
  );
}
