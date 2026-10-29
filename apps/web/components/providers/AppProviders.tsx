"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Role } from "@/lib/api/types";
import { isMockMode } from "@/lib/auth/mock";
import { MeProvider } from "./MeProvider";
import { RoleProvider } from "./RoleProvider";
import { MockProvider } from "./MockProvider";

interface AppProvidersProps {
  children: React.ReactNode;
  initialRole: Role;
}

export function AppProviders({ children, initialRole }: AppProvidersProps) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const mocksEnabled = isMockMode();

  return (
    <QueryClientProvider client={queryClient}>
      <RoleProvider initialRole={initialRole} mocksEnabled={mocksEnabled}>
        <MockProvider enabled={mocksEnabled}>
          <MeProvider>{children}</MeProvider>
        </MockProvider>
      </RoleProvider>
    </QueryClientProvider>
  );
}
