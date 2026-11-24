import { afterEach, describe, expect, it } from "vitest";
import type { Port } from "./api/types";
import { allowedPorts, readActivePort, resolveActivePort, writeActivePort } from "./active-port";

const ports: Port[] = [
  { id: "a", name: "A", port_code: "AAAAA", timezone: "UTC" },
  { id: "b", name: "B", port_code: "BBBBB", timezone: "UTC" },
];

describe("active port", () => {
  afterEach(() => window.localStorage.clear());

  it("limits operators to their assigned ports", () => {
    expect(allowedPorts(ports, { role: "port_operator", assigned_port_ids: ["b"] })).toEqual([ports[1]]);
    expect(allowedPorts(ports, { role: "importer_exporter", assigned_port_ids: [] })).toEqual(ports);
  });

  it("keeps a stored port only while it is still allowed", () => {
    expect(resolveActivePort("b", ports)).toBe("b");
    expect(resolveActivePort("gone", ports)).toBeNull();
    expect(resolveActivePort(null, ports)).toBeNull();
  });

  it("defaults a single-port user to that port", () => {
    expect(resolveActivePort(null, [ports[0]!])).toBe("a");
  });

  it("stores the choice per user", () => {
    writeActivePort("user_1", "b");
    expect(readActivePort("user_1")).toBe("b");
    expect(readActivePort("user_2")).toBeNull();
    writeActivePort("user_1", null);
    expect(readActivePort("user_1")).toBeNull();
  });
});
