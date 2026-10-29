import { describe, expect, it } from "vitest";
import { buildShipmentListQuery, SHIPMENT_PAGE_SIZE } from "./query";

describe("buildShipmentListQuery", () => {
  it("includes the default page and page size", () => {
    const query = new URLSearchParams(
      buildShipmentListQuery({ page: 1, pageSize: SHIPMENT_PAGE_SIZE }),
    );

    expect(query.get("page")).toBe("1");
    expect(query.get("page_size")).toBe("10");
    expect(query.has("status")).toBe(false);
    expect(query.has("q")).toBe(false);
  });

  it("includes status, trimmed reference, and UTC day boundaries", () => {
    const query = new URLSearchParams(
      buildShipmentListQuery({
        status: "arrived",
        arrivalFrom: "2026-11-01",
        arrivalTo: "2026-11-30",
        q: "  SHIP-2026  ",
        page: 2,
        pageSize: 10,
      }),
    );

    expect(query.get("status")).toBe("arrived");
    expect(query.get("arrival_from")).toBe("2026-11-01T00:00:00.000Z");
    expect(query.get("arrival_to")).toBe("2026-11-30T23:59:59.999Z");
    expect(query.get("q")).toBe("SHIP-2026");
    expect(query.get("page")).toBe("2");
  });

  it("omits blank reference searches", () => {
    const query = new URLSearchParams(
      buildShipmentListQuery({ q: "   ", page: 1, pageSize: 10 }),
    );

    expect(query.has("q")).toBe(false);
  });

  it("clamps pagination to safe values", () => {
    const low = new URLSearchParams(
      buildShipmentListQuery({ page: 0, pageSize: 0 }),
    );
    const high = new URLSearchParams(
      buildShipmentListQuery({ page: Number.NaN, pageSize: 500 }),
    );

    expect(low.get("page")).toBe("1");
    expect(low.get("page_size")).toBe("1");
    expect(high.get("page")).toBe("1");
    expect(high.get("page_size")).toBe("100");
  });
});
