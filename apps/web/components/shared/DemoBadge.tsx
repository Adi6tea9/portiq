import React from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

export function DemoBadge({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border-warning/30 bg-warning/10", className)}
    >
      <AlertTriangle aria-hidden="true" className="h-3 w-3 text-warning" />
      <span className="text-text">
        {children ?? "Synthetic demo data"}
      </span>
    </Badge>
  );
}
