import { beforeEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "@/lib/mocks/server";
import { setMockRole } from "@/lib/mocks/role";
import {
  buildOperatorOverviewQuery,
  buildOperatorShipmentsQuery,
} from "@/lib/operator/api";
import { atRiskMessages, OperatorClient } from "./OperatorClient";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function operatorShipmentRequests(): string[] {
  const requests: string[] = [];

  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/operator/shipments")) {
      requests.push(request.url);
    }
  });

  return requests;
}

async function waitForTable() {
  await waitFor(() => expect(screen.getByRole("table", { name: "Operator shipments" })).toBeTruthy());
  await waitFor(() =>
    expect(
      within(screen.getByRole("table", { name: "Operator shipments" })).getAllByRole(
        "row",
      ).length,
    ).toBeGreaterThan(1),
  );
}

describe("operator query builders", () => {
  it("sends every table filter and pagination param", () => {
    const params = new URLSearchParams(
      buildOperatorShipmentsQuery({
        status: "submitted",
        arrivalFrom: "2026-11-01",
        arrivalTo: "2026-11-05",
        minPredictedDwellDays: "4.5",
        warningCode: "TARIFF_MISSING",
        page: 2,
        pageSize: 10,
      }),
    );

    expect(params.get("status")).toBe("submitted");
    expect(params.get("arrival_from")).toBe("2026-11-01T00:00:00.000Z");
    expect(params.get("arrival_to")).toBe("2026-11-05T23:59:59.999Z");
    expect(params.get("min_predicted_dwell_days")).toBe("4.5");
    expect(params.get("warning_code")).toBe("TARIFF_MISSING");
    expect(params.get("page")).toBe("2");
    expect(params.get("page_size")).toBe("10");
  });

  it("omits empty table filters and the optional overview port", () => {
    const table = new URLSearchParams(
      buildOperatorShipmentsQuery({ page: 1, pageSize: 10 }),
    );
    expect(table.has("status")).toBe(false);
    expect(table.has("arrival_from")).toBe(false);
    expect(table.has("min_predicted_dwell_days")).toBe(false);
    expect(table.has("warning_code")).toBe(false);

    const overview = new URLSearchParams(
      buildOperatorOverviewQuery({
        from: "2026-11-01",
        to: "2026-12-01",
      }),
    );
    expect(overview.get("from")).toBe("2026-11-01");
    expect(overview.get("to")).toBe("2026-12-01");
    expect(overview.has("port_id")).toBe(false);
  });
});

describe("atRiskMessages", () => {
  it("shows only API reasons", () => {
    expect(
      atRiskMessages({
        shipment_id: "ops_ship_001",
        reference: "OPS-2026-001",
        reasons: [
          {
            code: "DWELL_ABOVE_THRESHOLD",
            message: "Predicted dwell is above the planning threshold.",
          },
        ],
      }),
    ).toEqual(["Predicted dwell is above the planning threshold."]);
  });

  it("says Reason unavailable when the API sends no reasons", () => {
    expect(
      atRiskMessages({
        shipment_id: "ops_ship_003",
        reference: "OPS-2026-003",
        reasons: [],
      }),
    ).toEqual(["Reason unavailable"]);
  });

  it("treats an empty reason message as unavailable", () => {
    expect(
      atRiskMessages({
        shipment_id: "ops_ship_004",
        reference: "OPS-2026-004",
        reasons: [{ code: "DOCUMENTATION_INCOMPLETE", message: "" }],
      }),
    ).toEqual(["Reason unavailable"]);
  });
});

describe("OperatorClient - F08", () => {
  beforeEach(() => {
    server.events.removeAllListeners("request:start");
  });

  it("renders two ports, KPIs, both charts, dwell table and at-risk reasons", async () => {
    setMockRole("port_operator");
    renderWithClient(<OperatorClient />);

    expect(
      await screen.findByRole("heading", { name: "Operator overview" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Port scope: Nhava Sheva (JNPA), Singapore"),
    ).toBeTruthy();

    for (const label of [
      "Submitted",
      "Arrived",
      "Cleared",
      "Yard utilization",
      "Berth utilization",
      "At risk",
    ]) {
      expect(screen.getAllByText(label, { exact: true }).length).toBeGreaterThan(0);
    }

    for (const text of [
      "Forecast utilization is above the high threshold.",
      "Predicted dwell is above the planning threshold.",
      "Documentation is incomplete.",
      "Reason unavailable",
    ]) {
      expect(await screen.findByText(text)).toBeTruthy();
    }

    expect(
      screen.getByRole("img", { name: /daily yard utilization percent/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /daily berth utilization percent/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /predicted dwell distribution/i }),
    ).toBeTruthy();

    const dwellTable = screen.getByRole("table", {
      name: "Dwell distribution table alternative",
    });
    expect(within(dwellTable).getAllByRole("row")).toHaveLength(7);
    expect(within(dwellTable).getByText("10–14")).toBeTruthy();
  });

  it("sends the selected filters to the server", async () => {
    setMockRole("port_operator");
    const requests = operatorShipmentRequests();
    renderWithClient(<OperatorClient />);

    await waitForTable();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "submitted" },
    });
    fireEvent.change(screen.getByLabelText("Arrival from"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("Arrival to"), {
      target: { value: "2026-11-20" },
    });
    fireEvent.change(screen.getByLabelText("Min predicted dwell (days)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Warning type"), {
      target: { value: "TARIFF_MISSING" },
    });

    await waitFor(() => {
      const last = new URL(requests.at(-1) ?? "http://localhost");

      expect(last.searchParams.get("status")).toBe("submitted");
      expect(last.searchParams.get("arrival_from")).toBe(
        "2026-11-01T00:00:00.000Z",
      );
      expect(last.searchParams.get("arrival_to")).toBe(
        "2026-11-20T23:59:59.999Z",
      );
      expect(last.searchParams.get("min_predicted_dwell_days")).toBe("5");
      expect(last.searchParams.get("warning_code")).toBe("TARIFF_MISSING");
      expect(last.searchParams.get("page")).toBe("1");
    });
  });

  it("requests the next page from the server", async () => {
    setMockRole("port_operator");
    const requests = operatorShipmentRequests();
    renderWithClient(<OperatorClient />);

    await waitForTable();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => {
      const last = new URL(requests.at(-1) ?? "http://localhost");
      expect(last.searchParams.get("page")).toBe("2");
    });
  });

  it("shows the permission page for an importer", async () => {
    setMockRole("importer_exporter");
    renderWithClient(<OperatorClient />);

    const denials = await screen.findAllByText("Access denied");
    expect(denials.length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("You do not have permission to view this page.")
        .length,
    ).toBeGreaterThan(0);
  });

  it("lets a platform admin open the overview", async () => {
    setMockRole("platform_admin");
    renderWithClient(<OperatorClient />);

    expect(
      await screen.findByRole("heading", { name: "Operator overview" }),
    ).toBeTruthy();
    expect(
      await screen.findByText("Reason unavailable"),
    ).toBeTruthy();
  });

  it("shows the table empty state when filters match nothing", async () => {
    setMockRole("port_operator");
    renderWithClient(<OperatorClient />);

    await waitForTable();

    fireEvent.change(screen.getByLabelText("Min predicted dwell (days)"), {
      target: { value: "999" },
    });

    expect(
      await screen.findByText("No shipments match the filters."),
    ).toBeTruthy();
  });
});
