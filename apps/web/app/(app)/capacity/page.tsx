import { CapacityClient } from "@/components/features/capacity/CapacityClient";
import { mockFlag } from "@/lib/mocks/flags";

interface CapacityPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function CapacityPage({ searchParams }: CapacityPageProps) {
  const mockEmpty = mockFlag(searchParams, "mock_empty");
  const mockInvalid = mockFlag(searchParams, "mock_invalid");

  return <CapacityClient mockEmpty={mockEmpty} mockInvalid={mockInvalid} />;
}
