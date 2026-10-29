import { AlertCircle, Inbox, Lock } from "lucide-react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

interface PageStateProps {
  state: "loading" | "empty" | "error" | "permission";
  title?: string;
  message?: string;
  requestId?: string;
  onRetry?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function PageState({
  state,
  title,
  message,
  requestId,
  onRetry,
  action,
}: PageStateProps) {
  if (state === "loading") {
    return (
      <div role="status" aria-live="polite" className="space-y-3 py-8">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Inbox aria-hidden="true" className="h-12 w-12 text-muted" />
        <div className="text-center">
          <p className="font-semibold text-text">{title ?? "No data"}</p>
          {message ? <p className="mt-1 text-sm text-muted">{message}</p> : null}
        </div>
        {action ? (
          <Button onClick={action.onClick} className="mt-2">
            {action.label}
          </Button>
        ) : null}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 py-16">
        <AlertCircle aria-hidden="true" className="h-12 w-12 text-danger" />
        <div className="text-center">
          <p className="font-semibold text-text">
            {title ?? "Something went wrong"}
          </p>
          {message ? <p className="mt-1 text-sm text-muted">{message}</p> : null}
          {requestId ? (
            <p className="mt-2 font-mono text-xs text-muted">
              Request ID: {requestId}
            </p>
          ) : null}
        </div>
        {onRetry ? (
          <Button onClick={onRetry} variant="outline" className="mt-2">
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <Lock aria-hidden="true" className="h-12 w-12 text-muted" />
      <div className="text-center">
        <p className="font-semibold text-text">{title ?? "Access denied"}</p>
        <p className="mt-1 text-sm text-muted">
          {message ?? "You do not have permission to view this page."}
        </p>
      </div>
    </div>
  );
}
