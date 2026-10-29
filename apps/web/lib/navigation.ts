import type { Role } from "./api/types";

export interface NavItem {
  label: string;
  href: string;
}

const NAVIGATION: Record<Role, readonly NavItem[]> = {
  importer_exporter: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Shipments", href: "/shipments" },
    { label: "Capacity", href: "/capacity" },
  ],
  port_operator: [
    { label: "Operator overview", href: "/operator" },
    { label: "Capacity", href: "/capacity" },
  ],
  platform_admin: [
    { label: "Operator overview", href: "/operator" },
    { label: "Tariffs", href: "/admin/tariffs" },
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  importer_exporter: "Importer / exporter",
  port_operator: "Port operator",
  platform_admin: "Platform admin",
};

export function navForRole(role: Role): readonly NavItem[] {
  return NAVIGATION[role];
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function titleForPath(
  pathname: string,
  items: readonly NavItem[],
): string {
  if (pathname.startsWith("/dev/sandbox")) {
    return "Component sandbox";
  }

  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActivePath(pathname, item.href));

  return match?.label ?? "PortIQ";
}
