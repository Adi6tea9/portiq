import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge, type StatusKind } from "./StatusBadge";
import { DemoBadge } from "./DemoBadge";
import { Callout } from "./Callout";
import { Field } from "./Field";
import { PageState } from "./PageState";
import { Money } from "./Money";
import { DateTime } from "./DateTime";
import { Stat } from "./Stat";
import { DataTable } from "./DataTable";
import { Input } from "../ui/input";

describe("StatusBadge", () => {
  const statuses: [StatusKind, string][] = [
    ["submitted", "Submitted"],
    ["arrived", "Arrived"],
    ["cleared", "Cleared"],
    ["at_risk", "At risk"],
    ["forecast_only", "Forecast only"],
  ];

  it.each(statuses)("renders %s as %s", (status, label) => {
    const { container } = render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});

describe("DemoBadge", () => {
  it("renders the exact demo copy", () => {
    render(<DemoBadge />);
    expect(screen.getByText("Synthetic demo data")).toBeTruthy();
  });
});

describe("Callout", () => {
  it("uses status for informational content", () => {
    render(<Callout variant="info">Hello</Callout>);
    expect(screen.getByRole("status").textContent).toContain("Hello");
  });

  it("uses alert for warning and danger content", () => {
    const { rerender } = render(
      <Callout variant="warning">Careful</Callout>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Careful");

    rerender(<Callout variant="danger">Broken</Callout>);
    expect(screen.getByRole("alert").textContent).toContain("Broken");
  });
});

describe("Field", () => {
  it("links the label, hint, error and required state", () => {
    render(
      <Field
        id="shipment-ref"
        label="Shipment reference"
        hint="Use the carrier reference"
        error="Reference is required"
        required
      >
        <Input />
      </Field>,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;

    expect(input.id).toBe("shipment-ref");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(
      "shipment-ref-hint shipment-ref-error",
    );
    expect(screen.getByText("Use the carrier reference").id).toBe(
      "shipment-ref-hint",
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Reference is required",
    );
  });

  it("omits optional descriptions when no hint or error exists", () => {
    render(
      <Field id="port" label="Port">
        <Input />
      </Field>,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;

    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("PageState", () => {
  it("announces loading with a status region", () => {
    render(<PageState state="loading" />);

    expect(screen.getByRole("status").textContent).toContain("Loading");
  });

  it("renders an empty state with an action", () => {
    const onClick = vi.fn();
    render(
      <PageState
        state="empty"
        title="No shipments"
        message="Nothing matches this filter."
        action={{ label: "Clear filters", onClick }}
      />,
    );

    expect(screen.getByText("No shipments")).toBeTruthy();
    expect(screen.getByText("Nothing matches this filter.")).toBeTruthy();

    fireEvent.click(screen.getByText("Clear filters"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an error with the request id and retry", () => {
    const onRetry = vi.fn();
    render(
      <PageState
        state="error"
        message="The service is unavailable."
        requestId="req_503"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("req_503");
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a permission state", () => {
    render(<PageState state="permission" />);

    expect(screen.getByText("Access denied")).toBeTruthy();
    expect(
      screen.getByText("You do not have permission to view this page."),
    ).toBeTruthy();
  });
});

describe("Money", () => {
  it("formats a decimal string without parsing it", () => {
    render(<Money amount="1234567.89" />);
    expect(screen.getByText("₹12,34,567.89")).toBeTruthy();
  });

  it("shows Unavailable with the API reason instead of zero", () => {
    render(<Money amount={null} reason="Demurrage is unavailable" />);

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Demurrage is unavailable")).toBeTruthy();
    expect(screen.queryByText("₹0.00")).toBeNull();
  });
});

describe("DateTime", () => {
  it("renders a machine-readable time in the port timezone", () => {
    const { container } = render(
      <DateTime isoTimestamp="2026-11-02T06:00:00Z" timezone="Asia/Kolkata" />,
    );

    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-11-02T06:00:00Z");
    expect(time?.textContent).toBe("2 Nov 2026, 11:30 IST");
  });

  it("shows Unavailable for an invalid timestamp", () => {
    render(<DateTime isoTimestamp="invalid" timezone="Asia/Kolkata" />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });
});

describe("Stat", () => {
  it("renders a label, value, supporting text and estimate marker", () => {
    render(
      <Stat
        label="Predicted demurrage"
        value="₹45,000.00"
        supportingText="Includes 3 free days"
        estimate
      />,
    );

    expect(screen.getByText("Predicted demurrage")).toBeTruthy();
    expect(screen.getByText("₹45,000.00")).toBeTruthy();
    expect(screen.getByText("Includes 3 free days")).toBeTruthy();
    expect(screen.getByText("Estimate")).toBeTruthy();
  });
});

describe("DataTable", () => {
  interface Row {
    id: string;
    name: string;
  }

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: "name", header: "Name" },
  ];

  it("renders a captioned table and paginates without losing focus", () => {
    const onPageChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={[
          { id: "1", name: "Alpha" },
          { id: "2", name: "Beta" },
        ]}
        caption="Shipment list"
        getRowId={(row) => row.id}
        pagination={{ page: 1, page_size: 2, total: 5 }}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByRole("table").querySelector("caption")?.textContent).toBe(
      "Shipment list",
    );
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3 · 5 rows")).toBeTruthy();

    const next = screen.getByLabelText("Next page");
    next.focus();
    fireEvent.click(next);

    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(document.activeElement).toBe(next);
  });

  it("disables navigation at the boundaries", () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={[{ id: "1", name: "Alpha" }]}
        caption="Shipment list"
        getRowId={(row) => row.id}
        pagination={{ page: 1, page_size: 2, total: 5 }}
      />,
    );

    expect(
      (screen.getByLabelText("Previous page") as HTMLButtonElement).disabled,
    ).toBe(true);

    rerender(
      <DataTable
        columns={columns}
        data={[{ id: "1", name: "Alpha" }]}
        caption="Shipment list"
        getRowId={(row) => row.id}
        pagination={{ page: 3, page_size: 2, total: 5 }}
      />,
    );

    expect(
      (screen.getByLabelText("Next page") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("renders the empty message when there are no rows", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        caption="Shipment list"
        getRowId={(row) => row.id}
        emptyMessage="No shipments found"
      />,
    );

    expect(screen.getByText("No shipments found")).toBeTruthy();
  });
});
