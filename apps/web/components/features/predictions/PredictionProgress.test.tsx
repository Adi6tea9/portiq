import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PredictionProgress } from "./PredictionProgress";

describe("PredictionProgress", () => {
  it("announces a busy run with the shipment reference", () => {
    render(<PredictionProgress shipmentReference="SHIP-2026-006" />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Running prediction…")).toBeTruthy();
    expect(screen.getByText("SHIP-2026-006")).toBeTruthy();
  });

  it("shows no invented stages or percentages", () => {
    render(<PredictionProgress />);

    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
