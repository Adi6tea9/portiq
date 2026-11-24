"use client";

import * as React from "react";
import { usePorts } from "@/lib/api/hooks/usePorts";
import type { Port } from "@/lib/api/types";
import { allowedPorts, readActivePort, resolveActivePort, writeActivePort } from "@/lib/active-port";
import { useMe } from "./MeProvider";

interface ActivePortContextValue {
  /** Ports the signed-in user may pick (operators: only their assigned ports). */
  ports: Port[];
  /** The user's default port, or null when none is chosen yet. */
  portId: string | null;
  setPortId: (portId: string | null) => void;
}

const NO_ACTIVE_PORT: ActivePortContextValue = {
  ports: [],
  portId: null,
  setPortId: () => {},
};

const ActivePortContext = React.createContext<ActivePortContextValue>(NO_ACTIVE_PORT);

export function ActivePortProvider({ children }: { children: React.ReactNode }) {
  const { me } = useMe();
  const portsQuery = usePorts({ enabled: !!me });
  const ports = React.useMemo(
    () => allowedPorts(portsQuery.data ?? [], me),
    [portsQuery.data, me],
  );
  const [stored, setStored] = React.useState<string | null>(null);
  const userId = me?.user_id ?? null;

  // Storage is read after mount so the server render and the first client render match.
  React.useEffect(() => {
    setStored(userId ? readActivePort(userId) : null);
  }, [userId]);

  const portId = resolveActivePort(stored, ports);

  const setPortId = React.useCallback(
    (next: string | null) => {
      setStored(next);
      if (userId) writeActivePort(userId, next);
    },
    [userId],
  );

  const value = React.useMemo(
    () => ({ ports, portId, setPortId }),
    [ports, portId, setPortId],
  );

  return <ActivePortContext.Provider value={value}>{children}</ActivePortContext.Provider>;
}

/** Outside the provider (isolated component tests) there is simply no active port. */
export function useActivePort(): ActivePortContextValue {
  return React.useContext(ActivePortContext);
}
