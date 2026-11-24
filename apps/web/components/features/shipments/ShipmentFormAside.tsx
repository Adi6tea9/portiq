import { Info, ListOrdered } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionTitle } from "@/components/shared/SectionTitle";

/** Side panel for the create and edit shipment forms. */
export function ShipmentFormAside({ mode }: { mode: "create" | "edit" }) {
  const steps =
    mode === "create"
      ? [
          "Save the shipment with its port, cargo and arrival details.",
          "Open it and choose Run prediction for a dwell-time and cost estimate.",
          "Use Plan this container to see how the cargo fits.",
        ]
      : [
          "Change any detail that is still open before the shipment arrives.",
          "Save, then run a new prediction so the estimate uses the new details.",
          "Earlier predictions stay in the shipment's prediction history.",
        ];

  return (
    <aside aria-label="About this form" className="min-w-0 space-y-section xl:sticky xl:top-24">
      <Card>
        <CardHeader className="pb-4">
          <SectionTitle icon={ListOrdered}>What happens next</SectionTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-light-teal text-xs font-semibold text-ocean-teal"
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <div className="app-note-callout flex gap-3 rounded-card p-4 text-sm">
        <Info aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-ocean-teal" />
        <p>
          The model inputs (customs channel, importer type and cargo priority) change the
          dwell estimate. Use the info buttons beside each field for details.
        </p>
      </div>
    </aside>
  );
}
