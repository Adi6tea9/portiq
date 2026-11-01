import { PredictionResultClient } from "@/components/features/predictions/PredictionResultClient";

interface PredictionResultPageProps {
  params: Promise<{ id: string; predictionId: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function PredictionResultPage({
  params,
  searchParams,
}: PredictionResultPageProps) {
  const { id, predictionId } = await params;
  const mockError =
    typeof searchParams.mock_error === "string"
      ? searchParams.mock_error
      : undefined;

  return (
    <PredictionResultClient
      shipmentId={id}
      predictionId={predictionId}
      mockError={mockError}
    />
  );
}
