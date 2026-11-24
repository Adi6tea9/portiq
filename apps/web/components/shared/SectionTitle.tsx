import type { LucideIcon } from "lucide-react";
import { CardTitle } from "../ui/card";

/** Card heading from the reference: tinted icon tile, title and an optional InfoTip. */
export function SectionTitle({
  icon: Icon,
  children,
  info,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  info?: React.ReactNode;
}) {
  return (
    <CardTitle className="flex items-center gap-2 text-section-title">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-light-teal text-ocean-teal">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <span>{children}</span>
      {info}
    </CardTitle>
  );
}
