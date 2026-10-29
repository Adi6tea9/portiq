import { describe, expect, it } from "vitest";
import { portWallTimeToUtc } from "./port-time";

describe("portWallTimeToUtc", () => {
  it("converts a port wall time in a fixed-offset zone", () => {
    expect(portWallTimeToUtc("2026-11-05T08:30", "Asia/Kolkata")).toBe(
      "2026-11-05T03:00:00.000Z",
    );
    expect(portWallTimeToUtc("2026-11-05T08:30", "Asia/Singapore")).toBe(
      "2026-11-05T00:30:00.000Z",
    );
  });

  it("handles daylight-saving offsets on both sides of the change", () => {
    expect(portWallTimeToUtc("2026-07-01T12:00", "America/New_York")).toBe(
      "2026-07-01T16:00:00.000Z",
    );
    expect(portWallTimeToUtc("2026-01-15T12:00", "America/New_York")).toBe(
      "2026-01-15T17:00:00.000Z",
    );
  });

  it("rejects values that are not wall-clock date-times", () => {
    expect(() => portWallTimeToUtc("2026-11-05", "Asia/Kolkata")).toThrow(
      "Expected a date and time in YYYY-MM-DDTHH:mm format.",
    );
    expect(() =>
      portWallTimeToUtc("2026-11-05T08:30:00Z", "Asia/Kolkata"),
    ).toThrow("Expected a date and time in YYYY-MM-DDTHH:mm format.");
  });
});
