"use client";

import * as React from "react";
import type { Role } from "@/lib/api/types";
import {
  getMockRole,
  setMockRole,
  subscribeToMockRole,
} from "@/lib/mocks/role";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
  canSwitchRole: boolean;
}

const RoleContext = React.createContext<RoleContextValue | null>(null);

interface RoleProviderProps {
  children: React.ReactNode;
  initialRole: Role;
  mocksEnabled: boolean;
}

export function RoleProvider({
  children,
  initialRole,
  mocksEnabled,
}: RoleProviderProps) {
  const [role, setRoleState] = React.useState<Role>(initialRole);

  React.useEffect(() => {
    if (!mocksEnabled) {
      return;
    }

    setRoleState(getMockRole());
    return subscribeToMockRole(setRoleState);
  }, [mocksEnabled]);

  const setRole = React.useCallback(
    (nextRole: Role) => {
      if (!mocksEnabled) {
        return;
      }

      setMockRole(nextRole);
      setRoleState(nextRole);
    },
    [mocksEnabled],
  );

  const value = React.useMemo<RoleContextValue>(
    () => ({ role, setRole, canSwitchRole: mocksEnabled }),
    [role, setRole, mocksEnabled],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = React.useContext(RoleContext);

  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }

  return context;
}
