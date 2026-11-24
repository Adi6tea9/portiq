"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { NAV_ICONS } from "./nav-icons";

export const PAGE_GUIDE: ReadonlyArray<{ page: string; who: string; body: string }> = [
  {
    page: "Dashboard",
    who: "Importers and exporters",
    body: "Your shipment counts by status, the latest predicted dwell and indicative cost, your latest milestone and a port capacity snapshot, with shortcuts to the main tasks.",
  },
  {
    page: "Shipments",
    who: "Importers and exporters",
    body: "Find shipments by status, arrival date or reference, create new ones and edit them until they arrive. Open a shipment to see its timeline and run a prediction.",
  },
  {
    page: "Predictions",
    who: "Importers, exporters and port operators",
    body: "The latest AI dwell-time prediction for each shipment you can see. Open one for the estimate, the cost breakdown, port capacity and what influenced the model.",
  },
  {
    page: "Capacity",
    who: "Everyone",
    body: "Forecast yard and berth utilization for a port and date range, marked against the moderate and high thresholds.",
  },
  {
    page: "Load planner",
    who: "Everyone",
    body: "See in 3D how cargo sits in a 20 ft or 40 ft container. Open it from a shipment to plan that shipment's own cargo lines.",
  },
  {
    page: "Operator overview",
    who: "Port operators and admins",
    body: "Shipment status counts, yard and berth utilization, the dwell distribution, at-risk shipments and a filterable shipment table for your ports.",
  },
  {
    page: "Tariffs",
    who: "Platform admins",
    body: "Add tariff rule versions used by the cost estimates and review the audit trail of every change.",
  },
  {
    page: "Settings",
    who: "Everyone",
    body: "Change how your name appears across PortIQ.",
  },
];

export function HelpSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Help: what each page does">
          <HelpCircle aria-hidden="true" className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle>What each page does</SheetTitle>
          <SheetDescription>
            A short guide to PortIQ. Estimates support planning; they are not an official
            customs assessment.
          </SheetDescription>
        </SheetHeader>
        <ul className="mt-6 space-y-3">
          {PAGE_GUIDE.map(({ page, who, body }) => {
            const Icon = NAV_ICONS[page];
            return (
              <li key={page} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                {Icon ? (
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-light-teal text-ocean-teal">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                ) : null}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-harbor-navy">{page}</p>
                  <p className="text-xs text-muted">{who}</p>
                  <p className="mt-1 text-sm leading-relaxed text-text">{body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
