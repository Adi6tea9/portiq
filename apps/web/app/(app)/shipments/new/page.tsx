import { NewShipmentForm } from "@/components/features/shipments/NewShipmentForm";
import { mockFlagValue } from "@/lib/mocks/flags";

interface NewShipmentPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function NewShipmentPage({ searchParams }: NewShipmentPageProps) {
  return (
    <NewShipmentForm mockError={mockFlagValue(searchParams, "mock_error")} />
  );
}
