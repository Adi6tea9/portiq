import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/lib/mocks/server";
import { mockShipments } from "@/lib/mocks/fixtures/shipments";
import { NewShipmentForm } from "./NewShipmentForm";
import { ShipmentsList } from "./ShipmentsList";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

async function fillValidShipmentForm(
  user: ReturnType<typeof userEvent.setup>,
) {
  await screen.findByRole("option", { name: /INNSA/ });
  await user.selectOptions(screen.getByLabelText(/^Port/), "port_nsa");
  await screen.findByText("Port timezone: Asia/Kolkata");
  await user.type(screen.getByLabelText(/^Reference/), "SHIP-2026-100");
  await user.selectOptions(screen.getByLabelText(/^Direction/), "import");
  await user.selectOptions(
    screen.getByLabelText(/^Cargo type/),
    "general_container",
  );
  await user.selectOptions(screen.getByLabelText(/^Container size/), "40");
  await user.type(screen.getByLabelText(/^HS code/), "850440");
  await user.type(screen.getByLabelText(/^Weight/), "18000");
  await user.type(screen.getByLabelText(/^Declared value/), "2500000.00");
  await user.selectOptions(screen.getByLabelText(/^Shipping line/), "Line A");
  await user.selectOptions(screen.getByLabelText(/^Vessel size band/), "large");
  await user.type(
    screen.getByLabelText(/^Expected arrival/),
    "2026-11-05T08:30",
  );
  await user.selectOptions(
    screen.getByLabelText(/^Documentation status/),
    "complete",
  );
}

describe("NewShipmentForm", () => {
  beforeEach(() => {
    routerPush.mockReset();
  });

  it("submits a valid shipment and navigates to its detail page", async () => {
    const user = userEvent.setup();
    renderWithClient(<NewShipmentForm />);

    await fillValidShipmentForm(user);
    await user.click(screen.getByRole("button", { name: "Create shipment" }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledTimes(1));
    expect(routerPush.mock.calls[0][0]).toMatch(/^\/shipments\/ship_/);
  });

  it("disables submit while saving and ignores a second submit", async () => {
    let postCount = 0;
    server.use(
      http.post("http://localhost:8000/api/v1/shipments", async () => {
        postCount += 1;
        await delay(150);

        return HttpResponse.json(
          {
            data: { ...mockShipments[0], id: "ship_created" },
            meta: { request_id: "req_created" },
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithClient(<NewShipmentForm />);

    await fillValidShipmentForm(user);
    const submit = screen.getByRole("button", { name: "Create shipment" });
    await user.click(submit);

    await waitFor(() =>
      expect((submit as HTMLButtonElement).disabled).toBe(true),
    );
    const form = submit.closest("form");

    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(routerPush).toHaveBeenCalledTimes(1));
    expect(postCount).toBe(1);
  });

  it("maps a 422 response to the weight field and shows the request id", async () => {
    const user = userEvent.setup();
    renderWithClient(<NewShipmentForm mockError="422" />);

    await fillValidShipmentForm(user);
    await user.click(screen.getByRole("button", { name: "Create shipment" }));

    expect(await screen.findByText("Must be greater than 0.")).toBeTruthy();
    expect(
      screen.getByText("The request contains invalid data."),
    ).toBeTruthy();
    expect(screen.getByText("Request ID: req_mock_422")).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("does not send the form error flag to the ports query", async () => {
    renderWithClient(<NewShipmentForm mockError="503" />);

    expect(
      await screen.findByRole("button", { name: "Create shipment" }),
    ).toBeTruthy();
    expect(screen.queryByText("The prediction service is unavailable. Try again later.")).toBeNull();
  });
});

describe("ShipmentsList", () => {
  beforeEach(() => {
    routerPush.mockReset();
  });

  it("renders the first page and paginates to the second", async () => {
    const user = userEvent.setup();
    renderWithClient(<ShipmentsList />);

    expect(await screen.findByText("SHIP-2026-001")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText(/Showing 1–10 of 12/)).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();

    const next = screen.getByRole("button", { name: "Next" });
    await waitFor(() =>
      expect((next as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(next);

    expect(await screen.findByText("SHIP-2026-011")).toBeTruthy();
    expect(await screen.findByText("Page 2 of 2")).toBeTruthy();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderWithClient(<ShipmentsList />);

    expect(await screen.findByText("SHIP-2026-001")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/^Status/), "arrived");

    await waitFor(() =>
      expect(screen.queryByText("SHIP-2026-001")).toBeNull(),
    );
    expect(screen.getByText("SHIP-2026-003")).toBeTruthy();
    expect(screen.getByText("SHIP-2026-004")).toBeTruthy();
    expect(screen.getByText("SHIP-2026-008")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("debounces the reference search", async () => {
    const user = userEvent.setup();
    renderWithClient(<ShipmentsList />);

    expect(await screen.findByText("SHIP-2026-001")).toBeTruthy();
    await user.type(screen.getByLabelText(/^Reference/), "SHIP-2026-012");

    expect(await screen.findByText("SHIP-2026-012")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText("SHIP-2026-001")).toBeNull(),
    );
  });

  it("shows the exact empty state when no shipment matches", async () => {
    const user = userEvent.setup();
    renderWithClient(<ShipmentsList />);

    expect(await screen.findByText("SHIP-2026-001")).toBeTruthy();
    await user.type(screen.getByLabelText(/^Reference/), "NO-MATCH");

    expect(await screen.findByText("No shipments yet.")).toBeTruthy();
    expect(
      screen.getByText("Create your first shipment to get an estimate."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create shipment" }),
    ).toBeTruthy();
  });

  it("shows the 503 message and request id", async () => {
    renderWithClient(<ShipmentsList mockError="503" />);

    expect(
      await screen.findByText(
        "The prediction service is unavailable. Try again later.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Request ID: req_mock_503")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
