import { LoadPlannerClient } from "@/components/features/load-planner/LoadPlannerClient";
import { ShipmentLoadPlanner } from "@/components/features/load-planner/ShipmentLoadPlanner";

interface LoadPlannerPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoadPlannerPage({ searchParams }: LoadPlannerPageProps) {
  const { shipment } = await searchParams;
  return typeof shipment === "string" && shipment ? (
    <ShipmentLoadPlanner shipmentId={shipment} />
  ) : (
    <LoadPlannerClient />
  );
}
