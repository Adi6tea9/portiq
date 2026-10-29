import { Badge } from "../ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  LineChart,
  Package,
} from "lucide-react";
import type { ShipmentStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type StatusKind = ShipmentStatus | "at_risk" | "forecast_only";

interface StatusBadgeProps {
  status: StatusKind;
  className?: string;
}

const CONFIG = {
  submitted: {
    label: "Submitted",
    icon: Clock,
    classes: "border-info/30 bg-info/10",
    iconClasses: "text-info",
  },
  arrived: {
    label: "Arrived",
    icon: Package,
    classes: "border-warning/30 bg-warning/10",
    iconClasses: "text-warning",
  },
  cleared: {
    label: "Cleared",
    icon: CheckCircle2,
    classes: "border-success/30 bg-success/10",
    iconClasses: "text-success",
  },
  at_risk: {
    label: "At risk",
    icon: AlertTriangle,
    classes: "border-warning/30 bg-warning/10",
    iconClasses: "text-warning",
  },
  forecast_only: {
    label: "Forecast only",
    icon: LineChart,
    classes: "border-route-blue/30 bg-route-blue/10",
    iconClasses: "text-route-blue",
  },
} as const;

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, icon: Icon, classes, iconClasses } = CONFIG[status];

  return (
    <Badge variant="outline" className={cn("gap-1", classes, className)}>
      <Icon aria-hidden="true" className={cn("h-3 w-3", iconClasses)} />
      <span className="text-text">{label}</span>
    </Badge>
  );
}
