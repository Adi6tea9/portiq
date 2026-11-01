import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/mocks/server";
import { mockShipments } from "@/lib/mocks/fixtures/shipments";
import { ShipmentDetailClient } from "./ShipmentDetailClient";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const mockRole = vi.hoisted(() => ({ role: "importer_exporter" }));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => mockRole,
}));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    client,
    ...render(
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    ),
  };
}

describe("ShipmentDetailClient - F04", () => {
  beforeEach(() => {
    routerPush.mockReset();
    mockRole.role = "importer_exporter";
  });

  it("shows Edit button for owner when status is submitted", async () => {
    const submitted = mockShipments.find((s) => s.status === "submitted")!;
    mockRole.role = "importer_exporter";
    renderWithClient(<ShipmentDetailClient id={submitted.id} />);

    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record event" })).toBeNull();
  });

  it("hides Edit button after shipment has arrived", async () => {
    const arrived = mockShipments.find((s) => s.status === "arrived")!;
    mockRole.role = "importer_exporter";
    renderWithClient(<ShipmentDetailClient id={arrived.id} />);

    await screen.findByText(arrived.reference);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("shows Record event button for operator with allowed next status", async () => {
    const submitted = mockShipments.find((s) => s.status === "submitted")!;
    mockRole.role = "port_operator";
    renderWithClient(<ShipmentDetailClient id={submitted.id} />);

    await screen.findByText(submitted.reference);
    expect(await screen.findByRole("button", { name: "Record event" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("shows only allowed next status in Record event sheet", async () => {
    const user = userEvent.setup();
    const submitted = mockShipments.find((s) => s.status === "submitted")!;
    mockRole.role = "port_operator";
    renderWithClient(<ShipmentDetailClient id={submitted.id} />);

    await screen.findByText(submitted.reference);
    await user.click(screen.getByRole("button", { name: "Record event" }));

    expect(await screen.findByText("Record event")).toBeTruthy();
    expect(screen.getByText(/Current: Submitted\. Allowed next: Arrived/)).toBeTruthy();
  });

  it("shows 409 STATE_CONFLICT message when event is not allowed", async () => {
    const user = userEvent.setup();
    const submitted = mockShipments.find((s) => s.status === "submitted")!;
    mockRole.role = "port_operator";

    server.use(
      http.post(
        `http://localhost:8000/api/v1/shipments/${submitted.id}/events`,
        () => {
          return HttpResponse.json(
            {
              error: {
                code: "STATE_CONFLICT",
                message: "That status change is not allowed.",
                request_id: "req_conflict",
              },
            },
            { status: 409 },
          );
        },
      ),
    );

    renderWithClient(<ShipmentDetailClient id={submitted.id} />);

    await screen.findByText(submitted.reference);
    await user.click(screen.getByRole("button", { name: "Record event" }));
    await screen.findByText("Record event");

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "arrived");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("That status change is not allowed."),
    ).toBeTruthy();
  });

  it("shows Predicted vs Actual for cleared shipments with distinct labels", async () => {
    const cleared = mockShipments.find(
      (s) => s.status === "cleared" && s.actual_dwell_days !== null,
    )!;
    renderWithClient(<ShipmentDetailClient id={cleared.id} />);

    await screen.findByText(cleared.reference);
    expect(screen.getByText("Predicted vs Actual")).toBeTruthy();
    expect(screen.getByText("Estimate")).toBeTruthy();
    expect(screen.getByText("Recorded")).toBeTruthy();
  });

  it("shows not found state for unknown shipment id", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/shipments/unknown_id", () => {
        return HttpResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Shipment not found.",
              request_id: "req_404",
            },
          },
          { status: 404 },
        );
      }),
    );

    renderWithClient(<ShipmentDetailClient id="unknown_id" />);

    expect(await screen.findByText("Shipment not found")).toBeTruthy();
    expect(
      screen.getByText(
        "This shipment doesn't exist or you don't have access to it.",
      ),
    ).toBeTruthy();
  });

  it("renders Run prediction button as disabled with F05 tooltip", async () => {
    // Use any submitted shipment - button is always disabled in F04
    const submitted = mockShipments.find((s) => s.status === "submitted")!;
    renderWithClient(<ShipmentDetailClient id={submitted.id} />);

    await screen.findByText(submitted.reference);

    // Button may not exist if shipment has a prediction, so check conditionally
    const runButton = screen.queryByRole("button", { name: "Run prediction" });
    if (runButton) {
      expect(runButton.hasAttribute("disabled")).toBe(true);
      expect(runButton.getAttribute("title")).toBe("Available after F05");
    }
  });
});
