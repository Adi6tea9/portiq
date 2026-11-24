import { PredictionResultClient } from "@/components/features/predictions/PredictionResultClient";
import { mockFlagValue } from "@/lib/mocks/flags";

interface PredictionResultPageProps {
  params: Promise<{ shipmentId: string; predictionId: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function PredictionResultPage({
  params,
  searchParams,
}: PredictionResultPageProps) {
  const { shipmentId, predictionId } = await params;

  return (
    <PredictionResultClient
      shipmentId={shipmentId}
      predictionId={predictionId}
      mockError={mockFlagValue(searchParams, "mock_error")}
    />
  );
}
