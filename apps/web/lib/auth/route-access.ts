import type { Role } from "../api/types";
import { navForRole } from "../navigation";

const ALL_ROLES: readonly Role[] = [
  "importer_exporter",
  "port_operator",
  "platform_admin",
];

const IMPORTER: readonly Role[] = ["importer_exporter"];
const IMPORTER_OR_OPERATOR: readonly Role[] = [
  "importer_exporter",
  "port_operator",
];
const OPERATOR_OR_ADMIN: readonly Role[] = [
  "port_operator",
  "platform_admin",
];
const ADMIN: readonly Role[] = ["platform_admin"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * F02 route table. Returns null for routes outside the table so unknown routes
 * still reach Next.js' not-found handling.
 */
export function rolesForPath(pathname: string): readonly Role[] | null {
  if (matchesPrefix(pathname, "/dashboard")) {
    return IMPORTER;
  }

  if (matchesPrefix(pathname, "/shipments/new")) {
    return IMPORTER;
  }

  if (pathname === "/shipments" || pathname === "/shipments/") {
    return IMPORTER;
  }

  if (/^\/shipments\/[^/]+/.test(pathname)) {
    return IMPORTER_OR_OPERATOR;
  }

  if (matchesPrefix(pathname, "/capacity")) {
    return IMPORTER_OR_OPERATOR;
  }

  if (matchesPrefix(pathname, "/operator")) {
    return OPERATOR_OR_ADMIN;
  }

  if (matchesPrefix(pathname, "/admin")) {
    return ADMIN;
  }

  if (matchesPrefix(pathname, "/settings")) {
    return ALL_ROLES;
  }

  if (matchesPrefix(pathname, "/dev/sandbox")) {
    return ALL_ROLES;
  }

  return null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const roles = rolesForPath(pathname);
  return roles === null || roles.includes(role);
}

export function defaultPathForRole(role: Role): string {
  return navForRole(role)[0]?.href ?? "/settings";
}
