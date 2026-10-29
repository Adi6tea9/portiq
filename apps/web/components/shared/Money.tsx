import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MoneyProps {
  amount: string | null;
  reason?: string | null;
  className?: string;
}

export function Money({ amount, reason, className }: MoneyProps) {
  if (amount === null) {
    return (
      <span className={cn("inline-flex flex-col", className)}>
        <span className="text-muted">Unavailable</span>
        {reason ? <span className="text-xs text-muted">{reason}</span> : null}
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>{formatMoney(amount)}</span>
  );
}
