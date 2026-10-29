"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Ship,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DemoBadge } from "../shared/DemoBadge";
import { DevRoleSwitcher } from "./DevRoleSwitcher";
import { useMe } from "../providers/MeProvider";
import { useRole } from "../providers/RoleProvider";
import { signOut } from "@/lib/auth/actions";
import {
  ROLE_LABELS,
  isActivePath,
  navForRole,
  titleForPath,
  type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Shipments: Package,
  Capacity: BarChart3,
  "Operator overview": Users,
  Tariffs: Receipt,
};

function iconFor(item: NavItem): LucideIcon {
  return ICONS[item.label] ?? Circle;
}

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavLink({ item, active, collapsed, onNavigate }: NavLinkProps) {
  const Icon = iconFor(item);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-light-teal text-harbor-navy"
          : "text-text hover:bg-canvas",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
      <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
    </Link>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ocean-teal text-white">
        <Ship aria-hidden="true" className="h-5 w-5" />
      </span>
      <span
        className={cn(
          "text-lg font-semibold tracking-tight text-harbor-navy",
          compact && "sr-only",
        )}
      >
        PortIQ
      </span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role: mockRole, canSwitchRole } = useRole();
  const { me, role: meRole } = useMe();
  const role = canSwitchRole ? mockRole : (meRole ?? mockRole);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const items = navForRole(role);
  const title = titleForPath(pathname, items);
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleSignOut = React.useCallback(async () => {
    await signOut();
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  }, [queryClient, router]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-harbor-navy"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "hidden flex-col border-r border-border bg-surface md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-4")}>
          <Link href="/" aria-label="PortIQ home">
            <Wordmark compact={collapsed} />
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-1 p-2">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>
        <div className={cn("p-2", collapsed && "flex justify-center")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <ChevronsRight aria-hidden="true" className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu aria-hidden="true" className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b border-border p-4 text-left">
                <SheetTitle>
                  <Wordmark />
                </SheetTitle>
                <SheetDescription>Primary navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile primary" className="space-y-1 p-2">
                {items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActivePath(pathname, item.href)}
                    collapsed={false}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <p className="truncate text-base font-semibold text-harbor-navy">
            {title}
          </p>

          <div className="ml-auto flex items-center gap-2">
            {canSwitchRole ? (
              <DemoBadge className="hidden sm:inline-flex" />
            ) : null}
            <DevRoleSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open profile menu"
                >
                  <User aria-hidden="true" className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block">
                    {me?.display_name ?? me?.email ?? "Signed in"}
                  </span>
                  <span className="block text-xs font-normal text-muted">
                    {ROLE_LABELS[role]}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
