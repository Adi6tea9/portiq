import { PredictionRunClient } from "@/components/features/predictions/PredictionRunClient";
import { mockFlagValue } from "@/lib/mocks/flags";

interface PredictionRunPageProps {
  params: Promise<{ shipmentId: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function PredictionRunPage({ params, searchParams }: PredictionRunPageProps) {
  const { shipmentId } = await params;
  const key = searchParams.key;

  return (
    <PredictionRunClient
      shipmentId={shipmentId}
      idempotencyKey={typeof key === "string" && key ? key : undefined}
      mockRunError={mockFlagValue(searchParams, "mock_run_error")}
    />
  );
}
