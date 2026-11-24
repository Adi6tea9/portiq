import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeProvider } from "@/components/providers/MeProvider";
import { setMockRole } from "@/lib/mocks/role";
import { PredictionsClient } from "./PredictionsClient";

function renderPredictions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MeProvider>
        <PredictionsClient />
      </MeProvider>
    </QueryClientProvider>,
  );
}

describe("PredictionsClient", () => {
  it("lists each shipment's latest prediction with a link to its results", async () => {
    setMockRole("importer_exporter");
    renderPredictions();

    expect(await screen.findByRole("heading", { name: "Predictions", level: 1 })).toBeTruthy();
    const link = await screen.findByRole("link", { name: "View results for SHIP-2026-001" });
    expect(link.getAttribute("href")).toBe("/predictions/ship_001/pred_001");

    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("6.2 days")).toBeTruthy();
    expect(within(row).getByText("₹2,85,700.00")).toBeTruthy();
  });

  it("offers the shipment page when no prediction has been run", async () => {
    setMockRole("importer_exporter");
    renderPredictions();

    await screen.findByRole("link", { name: "View results for SHIP-2026-001" });
    expect(screen.getAllByText("No prediction yet").length).toBeGreaterThan(0);
    const open = screen.getAllByRole("link", { name: /^Open shipment/ })[0]!;
    expect(open.getAttribute("href")).toMatch(/^\/shipments\/ship_\d+$/);
  });

  it("paginates the list", async () => {
    setMockRole("importer_exporter");
    const user = userEvent.setup();
    renderPredictions();

    expect(await screen.findByText("Page 1 of 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeTruthy();
  });

  it("uses the operator's port-scoped shipments for port operators", async () => {
    setMockRole("port_operator");
    renderPredictions();

    const links = await screen.findAllByRole("link", { name: /^View results for / });
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/predictions\/[^/]+\/[^/]+$/);
    }
  });
});
