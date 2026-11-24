import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, type ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/lib/mocks/server";
import {
  resetMockPredictionStore,
} from "@/lib/mocks/fixtures/predictions";
import { PredictionResultClient } from "./PredictionResultClient";
import { PredictionRunClient } from "./PredictionRunClient";
import { RunPredictionButton } from "./RunPredictionButton";

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const API_BASE = "http://localhost:8000/api/v1";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

async function renderResult(shipmentId: string, predictionId: string) {
  renderWithClient(
    <PredictionResultClient
      shipmentId={shipmentId}
      predictionId={predictionId}
    />,
  );
  await screen.findByRole("heading", { name: "Prediction results" });
}

describe("PredictionResultClient - F05", () => {
  beforeEach(() => {
    resetMockPredictionStore();
    routerPush.mockReset();
  });

  it("renders the full prediction with all seven blocks", async () => {
    await renderResult("ship_001", "pred_001");

    // 1. Headline (summary strip)
    const summary = screen.getByRole("region", { name: "Prediction summary" });
    expect(within(summary).getByText("Estimated dwell time")).toBeTruthy();
    expect(within(summary).getByText("6.2 days")).toBeTruthy();
    expect(within(summary).getByText("Prediction completed successfully")).toBeTruthy();
    // Clearance date: summary strip and "What it means".
    expect(screen.getAllByText(/11 Nov 2026/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/IST/).length).toBeGreaterThan(0);
    expect(screen.getByText("Estimate")).toBeTruthy();

    // 2. Cost (in the summary strip and the breakdown total)
    expect(screen.getAllByText("₹2,85,700.00")).toHaveLength(2);
    expect(screen.getByText("Customs duty")).toBeTruthy();
    expect(screen.getByText("Rule: tariff-v2.3")).toBeTruthy();
    expect(
      screen.getByText(
        "Indicative total; verify against applicable tariffs and carrier terms.",
      ),
    ).toBeTruthy();

    // 3. Capacity
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByText("(Moderate utilization)")).toBeTruthy();
    expect(
      screen.getByText("Forecast based on synthetic demo data"),
    ).toBeTruthy();
    expect(screen.getByText(/Forecast generated at/)).toBeTruthy();
    expect(screen.getAllByText(/28 Oct 2026.*20:00/).length).toBeGreaterThanOrEqual(
      2,
    );

    // 4. Explanation chart + table alternative
    expect(
      screen.getByRole("img", { name: /diverging bar chart/i }),
    ).toBeTruthy();
    expect(screen.getByText("Base value: 5.0 days")).toBeTruthy();
    expect(
      screen.getByText("Documentation Status decreased the model estimate by 0.8 days."),
    ).toBeTruthy();
    expect(
      screen.getByText("These are model effects, not proof of cause."),
    ).toBeTruthy();

    // 5. Warning
    // Shown in Important notes and repeated in Key insights.
    expect(screen.getAllByText(/uses synthetic demo data/i).length).toBeGreaterThanOrEqual(1);

    // 6. Provenance + demo badge
    expect(screen.getByText("Model: demo-model-0.8.2")).toBeTruthy();
    expect(screen.getByText("Synthetic demo data")).toBeTruthy();

    // 7. Disclaimer (also required on the cost card)
    expect(
      screen.getAllByText(/PortIQ provides planning estimates/i).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("shows a partial cost total with the unavailable line and its reason", async () => {
    await renderResult("ship_002", "pred_002");

    expect(screen.getAllByText("₹93,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Partial total: some components are missing.")).toBeTruthy();
    expect(
      screen.getByText(
        "No demurrage rule found for shipping line Line B and cargo type reefer.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Indicative total. Some components could not be calculated."),
    ).toBeTruthy();

    const demurrageRow = screen.getByText("Demurrage").closest("li");
    expect(demurrageRow).not.toBeNull();
    expect(within(demurrageRow as HTMLElement).getByText("Unavailable")).toBeTruthy();
    expect(within(demurrageRow as HTMLElement).queryByText(/0\.00/)).toBeNull();
  });

  it("shows the explanation reason with no chart when SHAP is unavailable", async () => {
    await renderResult("ship_003", "pred_003");

    expect(
      screen.getByText(
        "The SHAP explainer is unavailable for this prediction because of a model version mismatch.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("img", { name: /diverging bar chart/i })).toBeNull();
    expect(screen.queryByText("Feature contributions (days)")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Feature" })).toBeNull();
  });

  it("shows the capacity reason with no number when capacity is unavailable", async () => {
    await renderResult("ship_007", "pred_007");

    expect(
      screen.getByText(
        "Capacity forecast is not available for the requested arrival date range.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.queryByText("Low utilization")).toBeNull();
    expect(screen.queryByText("Moderate utilization")).toBeNull();
    expect(screen.queryByText("High utilization")).toBeNull();
  });

  it("shows the demo badge for synthetic predictions", async () => {
    await renderResult("ship_001", "pred_001");

    expect(screen.getByText("Synthetic demo data")).toBeTruthy();
    expect(screen.getByText("Source: Synthetic")).toBeTruthy();
  });

  it("never renders 0.00 for an unavailable cost line", async () => {
    await renderResult("ship_012", "pred_012");

    expect(screen.queryByText(/0\.00/)).toBeNull();
    expect(screen.queryByText(/₹0/)).toBeNull();

    const unavailable = screen.getAllByText("Unavailable");
    expect(unavailable.length).toBeGreaterThanOrEqual(5);

    expect(
      screen.getByText("No active customs duty rule matches this shipment."),
    ).toBeTruthy();
    expect(
      screen.getByText("No active demurrage rule matches this shipment."),
    ).toBeTruthy();
  });

  it("lists every feature in the breakdown, largest effect first", async () => {
    await renderResult("ship_001", "pred_001");

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(within(table).getByText("Cargo Type")).toBeTruthy();
    expect(screen.getByText("All 6 model inputs, largest effect first.")).toBeTruthy();
  });

  it("derives key insights only from the returned fields", async () => {
    await renderResult("ship_001", "pred_001");

    expect(
      screen.getByText(
        "Hs Code Category (85) had the largest upward effect, adding 1.0 days to the estimate.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Documentation Status (complete) had the largest downward effect, removing 0.8 days.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Port yard utilization is forecast at 72%/)).toBeTruthy();
    expect(screen.getByText("Customs duty is the largest cost line at ₹2,50,000.00.")).toBeTruthy();
  });

  it("shows every section on one page with jump links and the details panel", async () => {
    await renderResult("ship_001", "pred_001");

    const nav = screen.getByRole("navigation", { name: "Prediction sections" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["#overview", "#feature-impact", "#what-it-means", "#key-insights"]);
    for (const href of hrefs) {
      expect(document.getElementById(href!.slice(1))).not.toBeNull();
    }

    expect(screen.getByText(/The model expects this container to stay/)).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Important notes" })).toBeTruthy();
    expect(screen.getByText("Model: demo-model-0.8.2")).toBeTruthy();
  });

  it("credits PortIQ's in-house model and links back to Predictions and the shipment", async () => {
    await renderResult("ship_001", "pred_001");

    expect(screen.getByText(/trained in-house/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Predictions" }).getAttribute("href")).toBe(
      "/predictions",
    );
    expect(screen.getByRole("link", { name: "SHIP-2026-001" }).getAttribute("href")).toBe(
      "/shipments/ship_001",
    );
  });
});

describe("RunPredictionButton - F05", () => {
  beforeEach(() => {
    routerPush.mockReset();
  });

  it("opens the processing page with a fresh Idempotency-Key", async () => {
    const user = userEvent.setup();
    renderWithClient(<RunPredictionButton shipmentId="ship_006" />);

    await user.click(screen.getByRole("button", { name: "Run prediction" }));

    expect(routerPush).toHaveBeenCalledTimes(1);
    const url = new URL(routerPush.mock.calls[0][0] as string, "http://x");
    expect(url.pathname).toBe("/predictions/ship_006/run");
    expect(url.searchParams.get("key")).toMatch(UUID);
    expect(screen.getByRole("button", { name: "Starting prediction" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("navigates once on a double click", async () => {
    const user = userEvent.setup();
    renderWithClient(<RunPredictionButton shipmentId="ship_006" />);

    await user.dblClick(screen.getByRole("button", { name: "Run prediction" }));

    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it("passes the mock run error through", async () => {
    const user = userEvent.setup();
    renderWithClient(<RunPredictionButton shipmentId="ship_006" runMockError="503" />);

    await user.click(screen.getByRole("button", { name: "Run prediction" }));

    expect(routerPush.mock.calls[0][0]).toContain("mock_run_error=503");
  });
});

function unavailable503() {
  return HttpResponse.json(
    {
      error: {
        code: "MODEL_UNAVAILABLE",
        message: "The prediction service is unavailable. Try again later.",
        request_id: "req_mock_503",
      },
    },
    { status: 503 },
  );
}

describe("PredictionRunClient - F05", () => {
  beforeEach(() => {
    resetMockPredictionStore();
    routerReplace.mockReset();
  });

  it("shows the running state, then replaces itself with the result", async () => {
    server.use(
      http.post(`${API_BASE}/shipments/ship_006/prediction`, async () => {
        await delay(150);
        const { mockPredictionFull } = await import("@/lib/mocks/fixtures/predictions");
        return HttpResponse.json(
          {
            data: { ...mockPredictionFull, prediction_id: "pred_run", shipment_id: "ship_006" },
            meta: { request_id: "req_run" },
          },
          { status: 201 },
        );
      }),
    );

    renderWithClient(<PredictionRunClient shipmentId="ship_006" idempotencyKey="key-1" />);

    expect(screen.getByRole("heading", { name: "Running prediction" })).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith("/predictions/ship_006/pred_run");
    });
  });

  it("sends one request per key, with that key", async () => {
    const keys: string[] = [];
    server.use(
      http.post(`${API_BASE}/shipments/ship_006/prediction`, ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
        return unavailable503();
      }),
    );

    // StrictMode mounts effects twice, as the dev server does.
    renderWithClient(
      <StrictMode>
        <PredictionRunClient shipmentId="ship_006" idempotencyKey="key-1" />
      </StrictMode>,
    );
    await screen.findByText("The prediction service is unavailable. Try again later.");

    expect(keys).toEqual(["key-1"]);
  });

  it("explains a 503 and retries with a new key", async () => {
    const user = userEvent.setup();
    server.use(http.post(`${API_BASE}/shipments/ship_006/prediction`, unavailable503));

    renderWithClient(<PredictionRunClient shipmentId="ship_006" idempotencyKey="key-1" />);

    expect(
      await screen.findByText("The prediction service is unavailable. Try again later."),
    ).toBeTruthy();
    expect(screen.getByText("Request ID: req_mock_503")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to shipment" }).getAttribute("href")).toBe(
      "/shipments/ship_006",
    );

    await user.click(screen.getByRole("button", { name: "Retry prediction" }));

    const url = new URL(routerReplace.mock.calls[0][0] as string, "http://x");
    expect(url.pathname).toBe("/predictions/ship_006/run");
    expect(url.searchParams.get("key")).toMatch(UUID);
  });

  it("shows the 429 message", async () => {
    server.use(
      http.post(`${API_BASE}/shipments/ship_006/prediction`, () =>
        HttpResponse.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Too many requests. Please wait and try again.",
              request_id: "req_mock_429",
            },
          },
          { status: 429 },
        ),
      ),
    );

    renderWithClient(<PredictionRunClient shipmentId="ship_006" idempotencyKey="key-1" />);

    expect(await screen.findByText("Too many requests. Please wait and try again.")).toBeTruthy();
  });

  it("adds a key to the URL when it arrives without one", async () => {
    renderWithClient(<PredictionRunClient shipmentId="ship_006" />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledTimes(1));
    const url = new URL(routerReplace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.get("key")).toMatch(UUID);
  });
});
