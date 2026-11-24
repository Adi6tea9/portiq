"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Anchor,
  ArrowLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  LogOut,
  Menu,
  Settings,
  Ship,
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
import { HelpSheet } from "./HelpSheet";
import { NAV_ICONS } from "./nav-icons";
import { useMe } from "../providers/MeProvider";
import { useRole } from "../providers/RoleProvider";
import { ActivePortProvider, useActivePort } from "../providers/ActivePortProvider";
import { signOut } from "@/lib/auth/actions";
import {
  ROLE_LABELS,
  activeNavHref,
  backHrefFor,
  breadcrumbsForPath,
  navForRole,
  type Crumb,
  type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { portiqThemeContent } from "@/themes/portiq/content";

function initialsFor(name: string | undefined): string {
  const words = (name ?? "").split(/[\s@._-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "?";
}

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavLink({ item, active, collapsed, onNavigate }: NavLinkProps) {
  const Icon = NAV_ICONS[item.label] ?? Circle;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "app-nav-link flex min-h-control items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-light-teal text-harbor-navy" : "text-text hover:bg-canvas",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon aria-hidden="true" className="h-[18px] w-[18px] flex-shrink-0" />
      <span className={collapsed ? "sr-only" : "flex-1 truncate"}>{item.label}</span>
      {item.badge && !collapsed ? (
        <span className="app-nav-badge rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="app-wordmark-mark flex h-9 w-9 items-center justify-center rounded-lg bg-ocean-teal text-white">
        <Ship aria-hidden="true" className="h-5 w-5" />
      </span>
      <span
        className={cn(
          "app-wordmark text-xl font-semibold tracking-tight text-harbor-navy",
          compact && "sr-only",
        )}
      >
        PortIQ
      </span>
    </span>
  );
}

/** Sidebar "Active port": the user's default port for Capacity and new shipments. */
function ActivePortPicker({ id }: { id: string }) {
  const { ports, portId, setPortId } = useActivePort();

  if (ports.length === 0) return null;

  return (
    <div className="app-port-picker space-y-1.5 px-1">
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-wider opacity-80"
      >
        Active port
      </label>
      <div className="relative">
        <Anchor
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-80"
        />
        <select
          id={id}
          value={portId ?? ""}
          onChange={(event) => setPortId(event.target.value || null)}
          className="app-port-select h-control w-full appearance-none truncate rounded-lg border pl-9 pr-8 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">No default port</option>
          {ports.map((port) => (
            <option key={port.id} value={port.id}>
              {port.name}
            </option>
          ))}
        </select>
        <ChevronRight
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 opacity-80"
        />
      </div>
    </div>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${index}`}
              className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex")}
            >
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="truncate text-muted underline-offset-4 hover:text-text hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last ? "font-semibold text-harbor-navy" : "text-muted")}
                >
                  {crumb.label}
                </span>
              )}
              {!last ? (
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ActivePortProvider>
      <Shell>{children}</Shell>
    </ActivePortProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { role: mockRole, canSwitchRole } = useRole();
  const { me, role: meRole } = useMe();
  const role = canSwitchRole ? mockRole : (meRole ?? mockRole);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const items = navForRole(role);
  const activeHref = activeNavHref(pathname, items);
  const crumbs = breadcrumbsForPath(pathname, items);
  const backHref = backHrefFor(crumbs);
  const backLabel = crumbs.find((crumb) => crumb.href === backHref)?.label;
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Tablets (768–1023px) start with the icon rail so pages keep their width; the toggle still works.
  React.useEffect(() => {
    const tablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const sync = () => setCollapsed(tablet.matches);
    sync();
    tablet.addEventListener("change", sync);
    return () => tablet.removeEventListener("change", sync);
  }, []);

  // Close the mobile drawer whenever the route changes (back/forward included).
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  const displayName = me?.display_name ?? me?.email ?? "Signed in";
  const initials = initialsFor(me?.display_name ?? me?.email);

  const handleSignOut = React.useCallback(async () => {
    await signOut();
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  }, [queryClient, router]);

  const navList = (onNavigate?: () => void, isCollapsed = false) =>
    items.map((item) => (
      <NavLink
        key={item.href}
        item={item}
        active={item.href === activeHref}
        collapsed={isCollapsed}
        onNavigate={onNavigate}
      />
    ));

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-harbor-navy"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "app-sidebar hidden flex-shrink-0 flex-col border-r border-border bg-surface md:flex",
          collapsed ? "w-sidebar-collapsed" : "w-sidebar",
        )}
      >
        <div className={cn("flex h-header items-center", collapsed ? "justify-center" : "px-5")}>
          <Link href={items[0]?.href ?? "/settings"} aria-label="PortIQ home">
            <Wordmark compact={collapsed} />
          </Link>
        </div>
        <nav aria-label="Primary" className="space-y-1 px-3 py-2">
          {navList(undefined, collapsed)}
        </nav>
        {collapsed ? null : (
          <div className="px-3 pt-4">
            <ActivePortPicker id="active-port" />
          </div>
        )}
        <div className="flex-1" />
        {collapsed ? null : (
          <div className="app-sidebar-extra space-y-3 px-3 pb-2">
            <div className="app-sidebar-panel p-3">
              <p className="text-sm font-semibold text-white">
                {portiqThemeContent.decisionSupportTitle}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/75">
                {portiqThemeContent.decisionSupportBody}
              </p>
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 px-1 pt-3">
              <span
                aria-hidden="true"
                className="app-avatar flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              >
                {initials}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-medium text-white">
                  {displayName}
                </span>
                <span className="block truncate text-xs text-white/70">{ROLE_LABELS[role]}</span>
              </span>
            </div>
          </div>
        )}
        <div className={cn("p-2", collapsed && "flex justify-center")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="app-sidebar-control"
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
        <header className="app-header sticky top-0 z-30 flex h-header items-center gap-2 border-b border-border bg-surface px-gutter">
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
            <SheetContent side="left" className="app-drawer flex w-72 flex-col overflow-y-auto p-0">
              <SheetHeader className="app-drawer-header border-b border-border p-4 text-left">
                <SheetTitle>
                  <Wordmark />
                </SheetTitle>
                <SheetDescription>Primary navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile primary" className="space-y-1 p-3">
                {navList(() => setMobileOpen(false))}
              </nav>
              <div className="px-3 pb-4 pt-2">
                <ActivePortPicker id="active-port-mobile" />
              </div>
            </SheetContent>
          </Sheet>

          {backHref ? (
            <Button
              asChild
              variant="outline"
              size="icon"
              className="flex-shrink-0 rounded-full bg-surface"
            >
              <Link href={backHref} aria-label={`Previous page: ${backLabel ?? "back"}`}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}

          <Breadcrumbs crumbs={crumbs} />

          <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:gap-2">
            {canSwitchRole ? <DemoBadge className="hidden xl:inline-flex" /> : null}
            <DevRoleSwitcher />
            <HelpSheet />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label={`${initials}, open profile menu`}
                >
                  <span
                    aria-hidden="true"
                    className="app-avatar flex h-9 w-9 items-center justify-center rounded-full bg-light-teal text-xs font-semibold text-harbor-navy"
                  >
                    {initials}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block">{displayName}</span>
                  <span className="block text-xs font-normal text-muted">{ROLE_LABELS[role]}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings aria-hidden="true" className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="min-w-0 flex-1 px-gutter py-gutter-y">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
