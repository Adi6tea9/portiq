import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: string;
  supportingText?: string;
  estimate?: boolean;
  className?: string;
}

export function Stat({
  label,
  value,
  supportingText,
  estimate = false,
  className,
}: StatProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        {estimate ? (
          <span className="rounded bg-light-teal px-1.5 py-0.5 text-xs font-medium text-harbor-navy">
            Estimate
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{value}</p>
      {supportingText ? (
        <p className="mt-1 text-xs text-muted">{supportingText}</p>
      ) : null}
    </div>
  );
}
