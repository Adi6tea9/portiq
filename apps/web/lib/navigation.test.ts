import { describe, expect, it } from "vitest";
import {
  ROLE_LABELS,
  isActivePath,
  navForRole,
  titleForPath,
} from "./navigation";

describe("navForRole", () => {
  it("gives the importer shipment and capacity navigation", () => {
    expect(navForRole("importer_exporter")).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Shipments", href: "/shipments" },
      { label: "Capacity", href: "/capacity" },
    ]);
  });

  it("gives the port operator no shipment-list navigation", () => {
    const items = navForRole("port_operator");

    expect(items.map((item) => item.label)).toEqual([
      "Operator overview",
      "Capacity",
    ]);
    expect(items.some((item) => item.href === "/shipments")).toBe(false);
  });

  it("gives the platform admin operator and tariff navigation", () => {
    expect(navForRole("platform_admin").map((item) => item.label)).toEqual([
      "Operator overview",
      "Tariffs",
    ]);
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

describe("titleForPath", () => {
  const items = navForRole("importer_exporter");

  it("uses the matching navigation label", () => {
    expect(titleForPath("/shipments/ship_001", items)).toBe("Shipments");
  });

  it("names the sandbox explicitly", () => {
    expect(titleForPath("/dev/sandbox", items)).toBe("Component sandbox");
  });

  it("falls back to the product name", () => {
    expect(titleForPath("/unknown", items)).toBe("PortIQ");
  });
});
