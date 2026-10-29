"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageState } from "@/components/shared/PageState";
import { useMe } from "@/components/providers/MeProvider";
import { buildLoginRedirectUrl } from "@/lib/api/client";
import { canAccessPath } from "@/lib/auth/route-access";

export function AppGuard({ children }: { children: React.ReactNode }) {
  const { me, isLoading, error, isAuthenticated, refetch } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const isSandbox = pathname.startsWith("/dev/sandbox");

  React.useEffect(() => {
    if (isSandbox || isAuthenticated) {
      return;
    }

    const returnTo = `${pathname}${window.location.search}`;
    router.replace(buildLoginRedirectUrl(returnTo));
  }, [isAuthenticated, isSandbox, pathname, router]);

  if (isSandbox) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return <PageState state="loading" />;
  }

  if (isLoading) {
    return <PageState state="loading" />;
  }

  if (error) {
    return (
      <PageState
        state="error"
        message={error.message}
        requestId={error.requestId}
        onRetry={refetch}
      />
    );
  }

  if (!me) {
    return <PageState state="permission" />;
  }

  if (!canAccessPath(me.role, pathname)) {
    return <PageState state="permission" />;
  }

  return <>{children}</>;
}
