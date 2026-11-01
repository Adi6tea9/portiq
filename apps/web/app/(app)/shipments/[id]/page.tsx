import { ShipmentDetailClient } from "@/components/features/shipments/ShipmentDetailClient";

interface ShipmentDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function ShipmentDetailPage({
  params,
  searchParams,
}: ShipmentDetailPageProps) {
  const { id } = await params;
  const mockError =
    typeof searchParams.mock_error === "string"
      ? searchParams.mock_error
      : undefined;

  return <ShipmentDetailClient id={id} mockError={mockError} />;
}
