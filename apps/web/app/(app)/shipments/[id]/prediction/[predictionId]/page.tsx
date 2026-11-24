import { redirect } from "next/navigation";
import { predictionResultHref } from "@/lib/navigation";

interface LegacyPredictionResultPageProps {
  params: Promise<{ id: string; predictionId: string }>;
  searchParams: Record<string, string | string[] | undefined>;
}

/** Old results URL: kept so bookmarks and shared links land on the Predictions route. */
export default async function LegacyPredictionResultPage({
  params,
  searchParams,
}: LegacyPredictionResultPageProps) {
  const { id, predictionId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const search = query.toString();
  redirect(`${predictionResultHref(id, predictionId)}${search ? `?${search}` : ""}`);
}
