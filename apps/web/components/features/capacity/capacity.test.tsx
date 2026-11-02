import { beforeEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "@/lib/mocks/server";
import { formatDate } from "@/lib/format";
import { CapacityClient } from "./CapacityClient";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * DAY_MS).toISOString().slice(0, 10);
}

const FROM = isoDate(0);
const TO = isoDate(30);
const OVER_RANGE_TO = isoDate(44);

function chartLabel(): string {
  const first = formatDate(`${FROM}T00:00:00Z`, "Asia/Kolkata");
  const last = formatDate(`${isoDate(29)}T00:00:00Z`, "Asia/Kolkata");
  return `from ${first} to ${last}`;
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

async function setRange(from: string, to: string) {
  fireEvent.change(await screen.findByLabelText("From"), { target: { value: from } });
  fireEvent.change(await screen.findByLabelText("To"), { target: { value: to } });
}

function bodyRows() {
  const table = screen.getByRole("table");
  return within(table).getAllByRole("row").slice(1);
}

describe("CapacityClient - F06", () => {
  beforeEach(() => {
    server.events.removeAllListeners("request:start");
  });

  it("renders 30 daily yard buckets with chart, table, legend and labels", async () => {
    renderWithClient(<CapacityClient />);

    await setRange(FROM, TO);

    await waitFor(() => expect(bodyRows()).toHaveLength(30));

    expect(screen.getByText("Daily yard utilization (%)")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /daily yard utilization percent/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: new RegExp(chartLabel(), "i") }),
    ).toBeTruthy();

    // Threshold legend: text plus colour, from /config.
    expect(screen.getByText("Lower")).toBeTruthy();
    expect(screen.getByText("below 60%")).toBeTruthy();
    expect(screen.getByText("Moderate")).toBeTruthy();
    expect(screen.getByText("from 60%")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("from 85%")).toBeTruthy();

    // Synthetic + generated-at labels.
    expect(
      screen.getByText("Forecast based on synthetic demo data"),
    ).toBeTruthy();
    expect(screen.getByText(/Forecast generated at/)).toBeTruthy();

    // Table alternative columns.
    for (const header of [
      "Start",
      "Occupied",
      "Capacity",
      "Utilization",
      "Source",
      "Version",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(screen.getAllByText("capacity-rules-v1.4")).toHaveLength(30);
  });

  it("blocks an over-range request and shows the config limit", async () => {
    const requests: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/capacity/forecast")) {
        requests.push(request.url);
      }
    });

    renderWithClient(<CapacityClient />);

    await setRange(FROM, TO);
    await waitFor(() => expect(bodyRows()).toHaveLength(30));
    const beforeBlock = requests.length;

    fireEvent.change(await screen.findByLabelText("To"), {
      target: { value: OVER_RANGE_TO },
    });

    expect(
      await screen.findByText("The date range cannot exceed 31 days."),
    ).toBeTruthy();
    expect(screen.getByLabelText("To").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.queryByRole("table")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(beforeBlock);
  });

  it("shows the empty state when no buckets are returned", async () => {
    renderWithClient(<CapacityClient mockEmpty />);

    await setRange(FROM, TO);

    expect(
      await screen.findByText("No forecast is available for this range."),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("skips invalid buckets, notes the count and shows the empty state", async () => {
    renderWithClient(<CapacityClient mockInvalid />);

    await setRange(FROM, TO);

    expect(
      await screen.findByText("1 bucket could not be shown"),
    ).toBeTruthy();
    expect(
      screen.getByText("No forecast is available for this range."),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("requests berth buckets when the Berth tab is selected", async () => {
    const requests: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/capacity/forecast")) {
        requests.push(request.url);
      }
    });

    const user = userEvent.setup();
    renderWithClient(<CapacityClient />);

    await setRange(FROM, TO);
    await waitFor(() => expect(bodyRows()).toHaveLength(30));

    const berthTab = screen.getByRole("tab", { name: "Berth" });
    await user.click(berthTab);

    await waitFor(() =>
      expect(
        screen.getByText("Daily berth utilization (%)"),
      ).toBeTruthy(),
    );

    expect(berthTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Yard" }).getAttribute(
      "aria-selected",
    )).toBe("false");

    const berthRequest = requests.at(-1) ?? "";
    expect(berthRequest).toContain("resource_type=berth");

    // Berth capacity differs from the yard fixture.
    await waitFor(() => expect(bodyRows()).toHaveLength(30));
    const firstRow = bodyRows()[0];
    expect(
      within(firstRow).getByText("120"),
    ).toBeTruthy();
  });
});
