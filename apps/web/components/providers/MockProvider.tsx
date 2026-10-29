"use client";

import * as React from "react";
import { startMockWorker } from "@/lib/mocks/browser";

interface MockProviderProps {
  children: React.ReactNode;
  enabled: boolean;
}

export function MockProvider({ children, enabled }: MockProviderProps) {
  const [ready, setReady] = React.useState(!enabled);

  React.useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }

    let cancelled = false;

    startMockWorker()
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!ready) {
    return (
      <div role="status" className="p-8 text-sm text-muted">
        Starting synthetic demo data…
      </div>
    );
  }

  return <>{children}</>;
}
