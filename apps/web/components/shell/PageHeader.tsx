import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  icon?: LucideIcon;
  /** Status badges shown beside the title. */
  badges?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** The one page title block: icon, h1, status badges, subtitle and actions. */
export function PageHeader({
  title,
  icon: Icon,
  badges,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="app-page-icon mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-light-teal text-ocean-teal">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="break-words text-page-title text-harbor-navy">
              {title}
            </h1>
            {badges}
          </div>
          {description ? (
            <div className="max-w-3xl text-sm text-muted">{description}</div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** Small status pill used beside page titles (e.g. "Completed", "Estimate"). */
export function StatusPill({
  children,
  tone = "success",
}: {
  children: React.ReactNode;
  tone?: "success" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "success" && "bg-light-teal text-ocean-teal",
        tone === "neutral" && "bg-secondary text-text",
      )}
    >
      {children}
    </span>
  );
}
