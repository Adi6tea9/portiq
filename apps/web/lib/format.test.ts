import { describe, expect, it } from "vitest";
import {
  formatContainerSizeFt,
  formatDate,
  formatDateTime,
  formatDays,
  formatMoney,
  formatPercent,
  formatWeight,
} from "./format";

describe("formatMoney", () => {
  it("formats a decimal string with Indian grouping", () => {
    expect(formatMoney("45000.00")).toBe("₹45,000.00");
    expect(formatMoney("1234567.89")).toBe("₹12,34,567.89");
    expect(formatMoney("10000000.50")).toBe("₹1,00,00,000.50");
  });

  it("pads whole numbers to two decimal places", () => {
    expect(formatMoney("5000")).toBe("₹5,000.00");
    expect(formatMoney("10.5")).toBe("₹10.50");
  });

  it("keeps zero as a real value", () => {
    expect(formatMoney("0")).toBe("₹0.00");
    expect(formatMoney("0.00")).toBe("₹0.00");
  });

  it("never turns a missing value into zero", () => {
    expect(formatMoney(null)).toBe("Unavailable");
    expect(formatMoney("")).toBe("Unavailable");
    expect(formatMoney("   ")).toBe("Unavailable");
  });

  it("never turns a malformed value into zero", () => {
    expect(formatMoney("invalid")).toBe("Unavailable");
    expect(formatMoney("1,234.00")).toBe("Unavailable");
    expect(formatMoney("12.3.4")).toBe("Unavailable");
    expect(formatMoney("₹100")).toBe("Unavailable");
  });

  it("formats negative values without losing the sign", () => {
    expect(formatMoney("-1234.5")).toBe("-₹1,234.50");
    expect(formatMoney("-0.00")).toBe("₹0.00");
  });

  it("preserves digits beyond JavaScript safe integer precision", () => {
    expect(formatMoney("9007199254740993.45")).toBe("₹9,00,71,99,25,47,40,993.45");
  });

  it("rounds beyond two decimals using string-safe arithmetic", () => {
    expect(formatMoney("1.005")).toBe("₹1.01");
    expect(formatMoney("1.004")).toBe("₹1.00");
    expect(formatMoney("999.999")).toBe("₹1,000.00");
  });
});

describe("formatDays", () => {
  it("formats one decimal place with a unit", () => {
    expect(formatDays(6.2)).toBe("6.2 days");
    expect(formatDays(5)).toBe("5.0 days");
  });

  it("returns Unavailable for non-finite values", () => {
    expect(formatDays(Number.NaN)).toBe("Unavailable");
    expect(formatDays(Number.POSITIVE_INFINITY)).toBe("Unavailable");
  });
});

describe("formatPercent", () => {
  it("formats a whole percentage", () => {
    expect(formatPercent(72)).toBe("72%");
    expect(formatPercent(72.5)).toBe("73%");
  });

  it("returns Unavailable for non-finite values", () => {
    expect(formatPercent(Number.NaN)).toBe("Unavailable");
  });
});

describe("formatWeight", () => {
  it("formats kilograms with Indian grouping", () => {
    expect(formatWeight(12000)).toBe("12,000 kg");
    expect(formatWeight(500)).toBe("500 kg");
  });

  it("returns Unavailable for non-finite values", () => {
    expect(formatWeight(Number.NaN)).toBe("Unavailable");
  });
});

describe("formatDateTime", () => {
  it("formats in the port timezone with the zone shown", () => {
    expect(formatDateTime("2026-11-02T06:00:00Z", "Asia/Kolkata")).toBe(
      "2 Nov 2026, 11:30 IST",
    );
  });

  it("returns Unavailable for an invalid timestamp", () => {
    expect(formatDateTime("invalid", "Asia/Kolkata")).toBe("Unavailable");
  });
});

describe("formatDate", () => {
  it("formats a date in the port timezone", () => {
    expect(formatDate("2026-11-02T06:00:00Z", "Asia/Kolkata")).toBe("2 Nov 2026");
  });

  it("returns Unavailable for an invalid timestamp", () => {
    expect(formatDate("invalid", "Asia/Kolkata")).toBe("Unavailable");
  });
});

describe("formatContainerSizeFt", () => {
  it("formats container sizes", () => {
    expect(formatContainerSizeFt(20)).toBe("20 ft");
    expect(formatContainerSizeFt(40)).toBe("40 ft");
  });
});
