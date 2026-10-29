import { describe, expect, it } from "vitest";
import {
  loginPath,
  safeInternalPath,
  safeReturnTo,
} from "./return-path";

describe("safeInternalPath", () => {
  it("accepts internal paths with query and hash", () => {
    expect(safeInternalPath("/shipments?status=arrived#top")).toBe(
      "/shipments?status=arrived#top",
    );
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(safeInternalPath("https://example.com")).toBeNull();
    expect(safeInternalPath("//example.com")).toBeNull();
    expect(safeInternalPath("/\\example.com")).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(safeInternalPath("")).toBeNull();
    expect(safeInternalPath("dashboard")).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("rejects auth screens to avoid redirect loops", () => {
    expect(safeReturnTo("/login")).toBeNull();
    expect(safeReturnTo("/login?returnTo=%2Fdashboard")).toBeNull();
    expect(safeReturnTo("/signup")).toBeNull();
    expect(safeReturnTo("/forgot-password")).toBeNull();
    expect(safeReturnTo("/reset-password")).toBeNull();
    expect(safeReturnTo("/auth/callback")).toBeNull();
  });

  it("keeps allowed app paths", () => {
    expect(safeReturnTo("/admin/tariffs?tab=rules")).toBe(
      "/admin/tariffs?tab=rules",
    );
  });
});

describe("loginPath", () => {
  it("encodes a safe return path", () => {
    expect(loginPath("/shipments?status=arrived")).toBe(
      "/login?returnTo=%2Fshipments%3Fstatus%3Darrived",
    );
  });

  it("omits unsafe return paths", () => {
    expect(loginPath("https://example.com")).toBe("/login");
  });
});
