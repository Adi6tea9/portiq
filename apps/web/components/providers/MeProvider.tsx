"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "@/lib/api/client";
import type { Me, Role } from "@/lib/api/types";
import { isMockAuthenticated, isMockMode, subscribeToMockAuth } from "@/lib/auth/mock";
import { getMockRole, subscribeToMockRole } from "@/lib/mocks/role";

interface MeContextValue {
  me: Me | null;
  role: Role | null;
  isLoading: boolean;
  error: ApiError | null;
  isAuthenticated: boolean;
  refetch: () => void;
}

const MeContext = React.createContext<MeContextValue | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const mocksEnabled = isMockMode();
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = React.useState(
    () => !mocksEnabled || isMockAuthenticated(),
  );

  const query = useQuery<Me, ApiError>({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await apiClient<Me>("/me");
      return response.data;
    },
    enabled: isAuthenticated,
    retry: false,
  });

  React.useEffect(() => {
    if (!mocksEnabled) {
      return;
    }

    return subscribeToMockAuth(setIsAuthenticated);
  }, [mocksEnabled]);

  React.useEffect(() => {
    if (!mocksEnabled) {
      return;
    }

    return subscribeToMockRole(() => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    });
  }, [mocksEnabled, queryClient]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      queryClient.removeQueries({ queryKey: ["me"] });
    }
  }, [isAuthenticated, queryClient]);

  const refetch = React.useCallback(() => {
    void query.refetch();
  }, [query]);

  const value = React.useMemo<MeContextValue>(
    () => ({
      me: query.data ?? null,
      role: query.data?.role ?? null,
      isLoading: isAuthenticated && query.isLoading,
      error: query.error ?? null,
      isAuthenticated,
      refetch,
    }),
    [query.data, query.isLoading, query.error, isAuthenticated, refetch],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  const context = React.useContext(MeContext);

  if (!context) {
    throw new Error("useMe must be used within a MeProvider");
  }

  return context;
}
