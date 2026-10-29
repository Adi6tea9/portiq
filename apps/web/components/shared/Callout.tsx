import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalloutProps {
  variant: "info" | "warning" | "danger";
  children: React.ReactNode;
  className?: string;
}

const CONFIG = {
  info: {
    icon: Info,
    classes: "border-info/30 bg-info/5",
    iconClasses: "text-info",
    role: "status" as const,
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-warning/30 bg-warning/5",
    iconClasses: "text-warning",
    role: "alert" as const,
  },
  danger: {
    icon: AlertCircle,
    classes: "border-danger/30 bg-danger/5",
    iconClasses: "text-danger",
    role: "alert" as const,
  },
} as const;

export function Callout({ variant, children, className }: CalloutProps) {
  const { icon: Icon, classes, iconClasses, role } = CONFIG[variant];

  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm leading-relaxed",
        classes,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 h-5 w-5 flex-shrink-0", iconClasses)}
      />
      <div className="text-text">{children}</div>
    </div>
  );
}
