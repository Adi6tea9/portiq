import { describe, expect, it } from "vitest";
import {
  canAccessPath,
  defaultPathForRole,
  rolesForPath,
} from "./route-access";

describe("rolesForPath", () => {
  it("maps the F02 route table", () => {
    expect(rolesForPath("/dashboard")).toEqual(["importer_exporter"]);
    expect(rolesForPath("/shipments")).toEqual(["importer_exporter"]);
    expect(rolesForPath("/shipments/new")).toEqual(["importer_exporter"]);
    expect(rolesForPath("/shipments/ship_001")).toEqual([
      "importer_exporter",
      "port_operator",
    ]);
    expect(rolesForPath("/shipments/ship_001/prediction/pred_001")).toEqual([
      "importer_exporter",
      "port_operator",
    ]);
    expect(rolesForPath("/capacity")).toEqual([
      "importer_exporter",
      "port_operator",
    ]);
    expect(rolesForPath("/operator")).toEqual([
      "port_operator",
      "platform_admin",
    ]);
    expect(rolesForPath("/admin/tariffs")).toEqual(["platform_admin"]);
    expect(rolesForPath("/settings")).toEqual([
      "importer_exporter",
      "port_operator",
      "platform_admin",
    ]);
  });

  it("returns null for routes outside the table", () => {
    expect(rolesForPath("/")).toBeNull();
    expect(rolesForPath("/unknown")).toBeNull();
  });
});

describe("canAccessPath", () => {
  it("enforces the three role combinations", () => {
    expect(canAccessPath("importer_exporter", "/dashboard")).toBe(true);
    expect(canAccessPath("port_operator", "/dashboard")).toBe(false);
    expect(canAccessPath("platform_admin", "/dashboard")).toBe(false);

    expect(canAccessPath("port_operator", "/shipments/ship_001")).toBe(true);
    expect(canAccessPath("platform_admin", "/shipments/ship_001")).toBe(false);

    expect(canAccessPath("platform_admin", "/admin/tariffs")).toBe(true);
    expect(canAccessPath("importer_exporter", "/admin/tariffs")).toBe(false);
  });

  it("allows every role into settings and the dev sandbox", () => {
    for (const role of [
      "importer_exporter",
      "port_operator",
      "platform_admin",
    ] as const) {
      expect(canAccessPath(role, "/settings")).toBe(true);
      expect(canAccessPath(role, "/dev/sandbox")).toBe(true);
    }
  });
});

describe("defaultPathForRole", () => {
  it("uses the first navigation item for each role", () => {
    expect(defaultPathForRole("importer_exporter")).toBe("/dashboard");
    expect(defaultPathForRole("port_operator")).toBe("/operator");
    expect(defaultPathForRole("platform_admin")).toBe("/operator");
  });
});
