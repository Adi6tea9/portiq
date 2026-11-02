import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/mocks/server";
import { mockErrorResponses } from "@/lib/mocks/fixtures/errors";
import { DashboardClient } from "./DashboardClient";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const API_BASE = "http://localhost:8000/api/v1";

const CAPACITY_BUCKET = {
  bucket_start: "2026-11-01T00:00:00Z",
  bucket_end: "2026-11-02T00:00:00Z",
  resource_type: "yard",
  predicted_occupied: 560,
  total_capacity: 1000,
  utilization_pct: 56,
  source_type: "synthetic",
  model_or_rule_version: "capacity-rules-v1.4",
  generated_at: "2026-10-29T06:00:00Z",
};

function envelope(data: unknown) {
  return {
    data,
    meta: {
      request_id: "req_test",
      pagination: {
        page: 1,
        page_size: 20,
        total: Array.isArray(data) ? data.length : 0,
      },
    },
  };
}

// Fixed bucket so the default card is deterministic regardless of wall clock,
// while still honouring the page's mock failure flag.
function fixCapacity() {
  server.use(
    http.get(`${API_BASE}/capacity/forecast`, ({ request }) => {
      if (new URL(request.url).searchParams.get("mock_capacity_error")) {
        return HttpResponse.json(mockErrorResponses[503], { status: 503 });
      }

      return HttpResponse.json(envelope([CAPACITY_BUCKET]));
    }),
  );
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("DashboardClient - F07", () => {
  beforeEach(() => {
    fixCapacity();
  });

  it("renders every card from the API data", async () => {
    renderWithClient(<DashboardClient />);

    // Active shipments by status, straight from /shipments/summary.
    const summaryTitle = await screen.findByText("Active shipments");
    const summaryCard = summaryTitle.closest("div")
      ?.parentElement?.parentElement as HTMLElement;
    await waitFor(() => expect(within(summaryCard).getByText("7")).toBeTruthy());
    expect(within(summaryCard).getByText("Submitted")).toBeTruthy();
    expect(within(summaryCard).getByText("3")).toBeTruthy();
    expect(within(summaryCard).getByText("2")).toBeTruthy();

    // Latest prediction is ship_012 (newest latest_prediction.created_at).
    await waitFor(() => expect(screen.getByText("7.4 days")).toBeTruthy());
    expect(screen.getByText("Estimate")).toBeTruthy();
    expect(screen.getByText(/SHIP-2026-012/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Run prediction" }),
    ).toBeTruthy();

    // All-unavailable cost is shown as Unavailable with reasons, never 0.
    await waitFor(() =>
      expect(
        screen.getByText("No active customs duty rule matches this shipment."),
      ).toBeTruthy(),
    );
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/₹0\.00/)).toBeNull();

    // Capacity snapshot: threshold text + synthetic label.
    await waitFor(() => expect(screen.getByText("56%")).toBeTruthy());
    expect(screen.getByText("(Low utilization)")).toBeTruthy();
    expect(
      screen.getByText("Forecast based on synthetic demo data"),
    ).toBeTruthy();

    // Latest milestone: newest shipment by updated_at is ship_004.
    await waitFor(() => expect(screen.getByText(/Vessel berthed/)).toBeTruthy());
    expect(screen.getByText("Status changed to")).toBeTruthy();
    expect(screen.getByText("by Demo Operator")).toBeTruthy();

    // Upcoming arrivals heading is always present.
    expect(
      screen.getByText("Upcoming arrivals (next 7 days)"),
    ).toBeTruthy();
  });

  it("shows the partial cost breakdown for the forced latest shipment", async () => {
    renderWithClient(<DashboardClient mockLatestShipment="ship_002" />);

    await waitFor(() => expect(screen.getByText("9.4 days")).toBeTruthy());
    expect(screen.getByText(/SHIP-2026-002 \|/)).toBeTruthy();

    await waitFor(() => expect(screen.getByText("₹93,000.00")).toBeTruthy());
    expect(screen.getByText("Demurrage")).toBeTruthy();
    expect(
      screen.getByText(
        "No demurrage rule found for shipping line Line B and cargo type reefer.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Indicative total. Some components could not be calculated.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/₹0\.00/)).toBeNull();
  });

  it("keeps the other cards when the summary endpoint fails", async () => {
    server.use(
      http.get(`${API_BASE}/shipments/summary`, () =>
        HttpResponse.json(mockErrorResponses[503], { status: 503 }),
      ),
    );

    renderWithClient(<DashboardClient />);

    expect(
      await screen.findByText("Unable to load shipment counts"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();

    // The latest-prediction and cost cards still load.
    expect(await screen.findByText("7.4 days")).toBeTruthy();
    expect(
      await screen.findByText(
        "No active customs duty rule matches this shipment.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("56%")).toBeTruthy();
  });

  it("keeps the other cards when only capacity fails", async () => {
    renderWithClient(<DashboardClient mockCapacityError="503" />);

    expect(
      await screen.findByText("Unable to load the capacity snapshot"),
    ).toBeTruthy();
    expect(await screen.findByText("7.4 days")).toBeTruthy();
    expect(
      await screen.findByText(
        "No active customs duty rule matches this shipment.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("56%")).toBeNull();
  });

  it("shows an empty state with a call to action for a new user", async () => {
    renderWithClient(<DashboardClient mockEmpty />);

    expect(await screen.findByText("No shipments yet.")).toBeTruthy();
    expect(
      screen.getByText("Create your first shipment to get an estimate."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Create shipment" }).getAttribute("href"),
    ).toBe("/shipments/new");

    expect(
      screen.getAllByText("No prediction yet.").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("No arrivals in the next 7 days.")).toBeTruthy();
    expect(screen.getByText("No milestone recorded yet.")).toBeTruthy();
  });
});
