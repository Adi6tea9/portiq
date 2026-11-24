import type { Role } from "./api/types";

export interface NavItem {
  label: string;
  href: string;
  /** Short tag shown beside the label, e.g. "ML". */
  badge?: string;
}

export interface Crumb {
  label: string;
  /** Absent on the current page. */
  href?: string;
}

const DASHBOARD: NavItem = { label: "Dashboard", href: "/dashboard" };
const SHIPMENTS: NavItem = { label: "Shipments", href: "/shipments" };
const PREDICTIONS: NavItem = { label: "Predictions", href: "/predictions", badge: "ML" };
const CAPACITY: NavItem = { label: "Capacity", href: "/capacity" };
const LOAD_PLANNER: NavItem = { label: "Load planner", href: "/load-planner" };
const OPERATOR: NavItem = { label: "Operator overview", href: "/operator" };
const TARIFFS: NavItem = { label: "Tariffs", href: "/admin/tariffs" };
const SETTINGS: NavItem = { label: "Settings", href: "/settings" };

const NAVIGATION: Record<Role, readonly NavItem[]> = {
  importer_exporter: [DASHBOARD, SHIPMENTS, CAPACITY, LOAD_PLANNER, PREDICTIONS, SETTINGS],
  port_operator: [OPERATOR, CAPACITY, LOAD_PLANNER, PREDICTIONS, SETTINGS],
  platform_admin: [OPERATOR, TARIFFS, CAPACITY, LOAD_PLANNER, SETTINGS],
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

const SHIPMENT_DETAIL = /^\/shipments\/(?!new(\/|$))[^/]+/;
const PREDICTION_RESULT = /^\/predictions\/[^/]+\/[^/]+/;

/** The one URL for a prediction's results page, inside the Predictions section. */
export function predictionResultHref(shipmentId: string, predictionId: string): string {
  return `/predictions/${encodeURIComponent(shipmentId)}/${encodeURIComponent(predictionId)}`;
}

/**
 * The processing page for a prediction run. The Idempotency-Key rides in the URL so a
 * reload replays the same request instead of starting a second run.
 */
export function predictionRunHref(
  shipmentId: string,
  idempotencyKey: string,
  mockRunError?: string,
): string {
  const query = new URLSearchParams({ key: idempotencyKey });
  if (mockRunError) query.set("mock_run_error", mockRunError);
  return `/predictions/${encodeURIComponent(shipmentId)}/run?${query.toString()}`;
}

const PREDICTION_RUN = /^\/predictions\/[^/]+\/run\/?$/;

/**
 * The one nav entry to highlight for a path. A shipment opened by a role
 * without a Shipments entry belongs to the Operator overview it was opened from.
 */
export function activeNavHref(pathname: string, items: readonly NavItem[]): string | null {
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActivePath(pathname, item.href));
  if (match) return match.href;

  if (SHIPMENT_DETAIL.test(pathname) && has(items, OPERATOR.href)) {
    return OPERATOR.href;
  }

  return null;
}

/** Breadcrumb trail for the top bar; the last crumb is the current page. */
export function breadcrumbsForPath(pathname: string, items: readonly NavItem[]): Crumb[] {
  if (pathname.startsWith("/dev/sandbox")) {
    return [{ label: "Component sandbox" }];
  }

  const segments = pathname.split("/").filter(Boolean);
  const activeHref = activeNavHref(pathname, items);
  const section = items.find((item) => item.href === activeHref);

  if (segments[0] === "shipments" && segments.length >= 2) {
    const id = segments[1]!;
    const shipmentsCrumb: Crumb = has(items, SHIPMENTS.href)
      ? { label: SHIPMENTS.label, href: SHIPMENTS.href }
      : { label: OPERATOR.label, href: OPERATOR.href };

    if (id === "new") {
      return [shipmentsCrumb, { label: "New shipment" }];
    }

    const detail: Crumb = { label: "Shipment", href: `/shipments/${id}` };

    if (segments[2] === "edit") {
      return [shipmentsCrumb, detail, { label: "Edit" }];
    }

    return [shipmentsCrumb, { label: "Shipment" }];
  }

  if (PREDICTION_RUN.test(pathname)) {
    return [{ label: PREDICTIONS.label, href: PREDICTIONS.href }, { label: "Run prediction" }];
  }

  if (PREDICTION_RESULT.test(pathname)) {
    return [{ label: PREDICTIONS.label, href: PREDICTIONS.href }, { label: "Results" }];
  }

  if (section) {
    return [{ label: section.label }];
  }

  return [{ label: "PortIQ" }];
}

function has(items: readonly NavItem[], href: string): boolean {
  return items.some((item) => item.href === href);
}

/** Where the top-bar back button goes: the nearest crumb with a link, if any. */
export function backHrefFor(crumbs: Crumb[]): string | null {
  for (let index = crumbs.length - 2; index >= 0; index -= 1) {
    const href = crumbs[index]!.href;
    if (href) return href;
  }
  return null;
}
