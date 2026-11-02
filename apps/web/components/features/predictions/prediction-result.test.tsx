import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/lib/mocks/server";
import {
  resetMockPredictionStore,
} from "@/lib/mocks/fixtures/predictions";
import { PredictionResultClient } from "./PredictionResultClient";
import { RunPredictionButton } from "./RunPredictionButton";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

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
  await screen.findByRole("heading", { name: "Prediction result" });
}

describe("PredictionResultClient - F05", () => {
  beforeEach(() => {
    resetMockPredictionStore();
    routerPush.mockReset();
  });

  it("renders the full prediction with all seven blocks", async () => {
    await renderResult("ship_001", "pred_001");

    // 1. Headline
    expect(
      screen.getByText("Estimated dwell time: 6.2 days"),
    ).toBeTruthy();
    expect(screen.getByText(/11 Nov 2026/)).toBeTruthy();
    expect(screen.getAllByText(/IST/).length).toBeGreaterThan(0);
    expect(screen.getByText("Estimate")).toBeTruthy();

    // 2. Cost
    expect(screen.getByText("₹2,85,700.00")).toBeTruthy();
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
    expect(
      screen.getByText(/uses synthetic demo data/i),
    ).toBeTruthy();

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

    expect(screen.getByText("₹93,000.00")).toBeTruthy();
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
});

describe("RunPredictionButton - F05", () => {
  beforeEach(() => {
    resetMockPredictionStore();
    routerPush.mockReset();
  });

  it("shows the 503 message and a retry control", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${API_BASE}/shipments/ship_006/prediction`, () =>
        HttpResponse.json(
          {
            error: {
              code: "MODEL_UNAVAILABLE",
              message: "The prediction service is unavailable. Try again later.",
              request_id: "req_mock_503",
            },
          },
          { status: 503 },
        ),
      ),
    );

    renderWithClient(<RunPredictionButton shipmentId="ship_006" />);

    await user.click(
      screen.getByRole("button", { name: "Run prediction" }),
    );

    expect(
      await screen.findByText(
        "The prediction service is unavailable. Try again later.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Request ID: req_mock_503")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("shows the 429 message", async () => {
    const user = userEvent.setup();

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

    renderWithClient(<RunPredictionButton shipmentId="ship_006" />);

    await user.click(
      screen.getByRole("button", { name: "Run prediction" }),
    );

    expect(
      await screen.findByText("Too many requests. Please wait and try again."),
    ).toBeTruthy();
  });

  it("sends one request on a double click", async () => {
    const user = userEvent.setup();
    let postCount = 0;

    server.use(
      http.post(`${API_BASE}/shipments/ship_006/prediction`, async () => {
        postCount += 1;
        await delay(200);
        const { mockPredictionFull } = await import(
          "@/lib/mocks/fixtures/predictions"
        );

        return HttpResponse.json(
          {
            data: {
              ...mockPredictionFull,
              prediction_id: "pred_double",
              shipment_id: "ship_006",
            },
            meta: { request_id: "req_double" },
          },
          { status: 201 },
        );
      }),
    );

    renderWithClient(<RunPredictionButton shipmentId="ship_006" />);

    await user.dblClick(
      screen.getByRole("button", { name: "Run prediction" }),
    );

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(
        "/shipments/ship_006/prediction/pred_double",
      );
    });
    expect(postCount).toBe(1);
  });

  it("creates a fresh Idempotency-Key per click", async () => {
    const user = userEvent.setup();
    const keys: string[] = [];

    server.use(
      http.post(`${API_BASE}/shipments/ship_006/prediction`, ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key") ?? "");

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
      }),
    );

    renderWithClient(<RunPredictionButton shipmentId="ship_006" />);

    await user.click(screen.getByRole("button", { name: "Run prediction" }));
    await screen.findByRole("button", { name: "Retry" });
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("navigates to the new prediction on success", async () => {
    const user = userEvent.setup();

    renderWithClient(<RunPredictionButton shipmentId="ship_006" />);

    await user.click(
      screen.getByRole("button", { name: "Run prediction" }),
    );

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledTimes(1);
    });

    const target = routerPush.mock.calls[0][0] as string;
    expect(target).toMatch(/^\/shipments\/ship_006\/prediction\/pred_/);
  });
});
