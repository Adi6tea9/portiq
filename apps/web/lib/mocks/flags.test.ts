import { afterEach, describe, expect, it } from "vitest";
import { mockFlag, mockFlagValue } from "./flags";

const original = process.env.NEXT_PUBLIC_USE_MOCKS;

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
  } else {
    process.env.NEXT_PUBLIC_USE_MOCKS = original;
  }
});

describe("mock flags", () => {
  it("ignores every flag when mocks are disabled", () => {
    process.env.NEXT_PUBLIC_USE_MOCKS = "false";

    expect(mockFlag({ mock_empty: "1" }, "mock_empty")).toBe(false);
    expect(mockFlag({ mock_invalid: "1" }, "mock_invalid")).toBe(false);
    expect(
      mockFlagValue({ mock_latest_shipment: "ship_002" }, "mock_latest_shipment"),
    ).toBeUndefined();
    expect(mockFlagValue({ mock_error: "503" }, "mock_error")).toBeUndefined();
    expect(
      mockFlagValue({ mock_capacity_error: "503" }, "mock_capacity_error"),
    ).toBeUndefined();
  });

  it("reads flags when mocks are enabled", () => {
    process.env.NEXT_PUBLIC_USE_MOCKS = "true";

    expect(mockFlag({ mock_empty: "1" }, "mock_empty")).toBe(true);
    expect(mockFlag({ mock_empty: "0" }, "mock_empty")).toBe(false);
    expect(
      mockFlagValue({ mock_latest_shipment: "ship_002" }, "mock_latest_shipment"),
    ).toBe("ship_002");
  });
});
