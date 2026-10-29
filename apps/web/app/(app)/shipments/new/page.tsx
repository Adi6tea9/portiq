import { NewShipmentForm } from "@/components/features/shipments/NewShipmentForm";

interface NewShipmentPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function NewShipmentPage({ searchParams }: NewShipmentPageProps) {
  const mockError =
    typeof searchParams.mock_error === "string"
      ? searchParams.mock_error
      : undefined;

  return <NewShipmentForm mockError={mockError} />;
}
