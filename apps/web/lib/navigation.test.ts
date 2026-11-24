import { describe, expect, it } from "vitest";
import {
  ROLE_LABELS,
  activeNavHref,
  backHrefFor,
  breadcrumbsForPath,
  isActivePath,
  navForRole,
  predictionResultHref,
} from "./navigation";

const importer = navForRole("importer_exporter");
const operator = navForRole("port_operator");
const admin = navForRole("platform_admin");

describe("navForRole", () => {
  it("gives the importer shipment, prediction and capacity navigation", () => {
    expect(importer.map((item) => item.label)).toEqual([
      "Dashboard",
      "Shipments",
      "Capacity",
      "Load planner",
      "Predictions",
      "Settings",
    ]);
    expect(importer.find((item) => item.href === "/predictions")?.badge).toBe("ML");
  });

  it("gives the port operator no shipment-list navigation", () => {
    expect(operator.map((item) => item.label)).toEqual([
      "Operator overview",
      "Capacity",
      "Load planner",
      "Predictions",
      "Settings",
    ]);
    expect(operator.some((item) => item.href === "/shipments")).toBe(false);
  });

  it("gives the platform admin operator, tariff, capacity and planner navigation", () => {
    expect(admin.map((item) => item.label)).toEqual([
      "Operator overview",
      "Tariffs",
      "Capacity",
      "Load planner",
      "Settings",
    ]);
  });

  it("keeps each role's first entry as its home page", () => {
    expect(importer[0]?.href).toBe("/dashboard");
    expect(operator[0]?.href).toBe("/operator");
    expect(admin[0]?.href).toBe("/operator");
  });

  it("labels every role", () => {
    expect(Object.keys(ROLE_LABELS)).toEqual([
      "importer_exporter",
      "port_operator",
      "platform_admin",
    ]);
  });
});

describe("isActivePath", () => {
  it("matches an exact route and its children", () => {
    expect(isActivePath("/shipments", "/shipments")).toBe(true);
    expect(isActivePath("/shipments/ship_001", "/shipments")).toBe(true);
  });

  it("does not match a shared prefix", () => {
    expect(isActivePath("/shipments-archive", "/shipments")).toBe(false);
  });
});

describe("activeNavHref", () => {
  it.each([
    ["/dashboard", importer, "/dashboard"],
    ["/shipments", importer, "/shipments"],
    ["/shipments/new", importer, "/shipments"],
    ["/shipments/ship_001", importer, "/shipments"],
    ["/shipments/ship_001/edit", importer, "/shipments"],
    ["/predictions/ship_001/pred_001", importer, "/predictions"],
    ["/predictions", importer, "/predictions"],
    ["/settings", importer, "/settings"],
    ["/shipments/ship_001", operator, "/operator"],
    ["/predictions/ship_001/pred_001", operator, "/predictions"],
    ["/capacity", admin, "/capacity"],
    ["/load-planner", admin, "/load-planner"],
    ["/admin/tariffs", admin, "/admin/tariffs"],
  ] as const)("highlights %s", (pathname, items, expected) => {
    expect(activeNavHref(pathname, items)).toBe(expected);
  });

  it("highlights nothing for an unknown route", () => {
    expect(activeNavHref("/unknown", importer)).toBeNull();
  });
});

describe("breadcrumbsForPath", () => {
  it("names a top-level page", () => {
    expect(breadcrumbsForPath("/capacity", importer)).toEqual([{ label: "Capacity" }]);
  });

  it("files prediction results under Predictions", () => {
    const crumbs = breadcrumbsForPath("/predictions/s1/p1", importer);
    expect(crumbs).toEqual([{ label: "Predictions", href: "/predictions" }, { label: "Results" }]);
    expect(backHrefFor(crumbs)).toBe("/predictions");
  });

  it("builds the one results URL inside Predictions", () => {
    expect(predictionResultHref("ship_001", "pred_001")).toBe("/predictions/ship_001/pred_001");
  });

  it("files an operator's shipment under the operator overview", () => {
    expect(breadcrumbsForPath("/shipments/s1", operator)).toEqual([
      { label: "Operator overview", href: "/operator" },
      { label: "Shipment" },
    ]);
  });

  it("nests the edit page under the shipment", () => {
    expect(breadcrumbsForPath("/shipments/s1/edit", importer)).toEqual([
      { label: "Shipments", href: "/shipments" },
      { label: "Shipment", href: "/shipments/s1" },
      { label: "Edit" },
    ]);
  });

  it("names the sandbox and falls back to the product name", () => {
    expect(breadcrumbsForPath("/dev/sandbox", admin)).toEqual([{ label: "Component sandbox" }]);
    expect(breadcrumbsForPath("/unknown", importer)).toEqual([{ label: "PortIQ" }]);
  });
});

describe("backHrefFor", () => {
  it("goes to the nearest linked parent", () => {
    expect(backHrefFor(breadcrumbsForPath("/shipments/s1/edit", importer))).toBe("/shipments/s1");
  });

  it("has no back target on a top-level page", () => {
    expect(backHrefFor(breadcrumbsForPath("/dashboard", importer))).toBeNull();
  });
});
