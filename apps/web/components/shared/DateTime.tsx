import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DateTimeProps {
  isoTimestamp: string;
  timezone: string;
  className?: string;
}

export function DateTime({ isoTimestamp, timezone, className }: DateTimeProps) {
  const formatted = formatDateTime(isoTimestamp, timezone);

  if (formatted === "Unavailable") {
    return <span className={cn("text-muted", className)}>Unavailable</span>;
  }

  return (
    <time dateTime={isoTimestamp} className={cn("tabular-nums", className)}>
      {formatted}
    </time>
  );
}
