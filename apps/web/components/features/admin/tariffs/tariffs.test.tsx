import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setMockRole } from "@/lib/mocks/role";
import { TariffsClient } from "./TariffsClient";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

async function waitForRulesTable() {
  const table = await screen.findByRole("table", { name: "Tariff rules" });

  await waitFor(() =>
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1),
  );

  return table;
}

function submitConflictForm() {
  fireEvent.change(screen.getByLabelText(/^Port$/), {
    target: { value: "port_nsa" },
  });
  fireEvent.change(screen.getByLabelText(/^HS code prefix/), {
    target: { value: "85" },
  });
  fireEvent.change(screen.getByLabelText(/^Rate value/), {
    target: { value: "10.00" },
  });
  fireEvent.change(screen.getByLabelText(/^Valid from/), {
    target: { value: "2026-11-01" },
  });
  fireEvent.change(screen.getByLabelText(/^Source note/), {
    target: { value: "Conflict test" },
  });
  fireEvent.change(screen.getByLabelText(/^Version/), {
    target: { value: "tariff-v2.3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create version" }));
}

describe("TariffsClient - F09", () => {
  it("shows the rules table with demo badge and no delete control", async () => {
    setMockRole("platform_admin");
    renderWithClient(<TariffsClient />);

    expect(
      await screen.findByRole("heading", { name: "Tariffs" }),
    ).toBeTruthy();
    expect(screen.getByText("Demo tariff data")).toBeTruthy();

    const table = await waitForRulesTable();
    expect(within(table).getAllByText("Create new version").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Deactivate").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByText(/delete/i)).toBeNull();
  });

  it("validates form rules for date order, decimal rate and source note", async () => {
    setMockRole("platform_admin");
    renderWithClient(<TariffsClient />);
    await waitForRulesTable();

    fireEvent.change(screen.getByLabelText(/^Rate value/), {
      target: { value: "-1" },
    });
    fireEvent.change(screen.getByLabelText(/^Valid from/), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(screen.getByLabelText(/^Valid to/), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create version" }));

    expect(
      await screen.findByText("A source note is required."),
    ).toBeTruthy();
    expect(
      screen.getByText("Enter a non-negative amount with up to 2 decimals."),
    ).toBeTruthy();
    expect(screen.getByText("Must be after the start date.")).toBeTruthy();
    expect(screen.getByText("Enter a version.")).toBeTruthy();
  });

  it("shows the conflict dialog for TARIFF_CONFLICT", async () => {
    setMockRole("platform_admin");
    renderWithClient(<TariffsClient />);
    await waitForRulesTable();

    submitConflictForm();

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Tariff conflict" }),
    ).toBeTruthy();
    expect(
      screen.getByText("A tariff rule with this version already exists."),
    ).toBeTruthy();
    expect(screen.getByText(/Request ID:/)).toBeTruthy();
  });

  it("creates a new version without a delete control", async () => {
    setMockRole("platform_admin");
    renderWithClient(<TariffsClient />);
    await waitForRulesTable();

    fireEvent.change(screen.getByLabelText(/^Rate value/), {
      target: { value: "1.00" },
    });
    fireEvent.change(screen.getByLabelText(/^Valid from/), {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/^Source note/), {
      target: { value: "Flag test" },
    });
    fireEvent.change(screen.getByLabelText(/^Version/), {
      target: { value: "tariff-v9.9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create version" }));

    expect(await screen.findByText("Tariff version tariff-v9.9 created.")).toBeTruthy();
  });

  it("confirms create-new-version and prefills the form", async () => {
    setMockRole("platform_admin");
    renderWithClient(<TariffsClient />);
    await waitForRulesTable();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Create new version from tariff-v2.3",
      }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Create new version" }),
    ).toBeTruthy();
    expect(screen.getByText(/The current rule stays active/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText(/^Version/) as HTMLInputElement).value,
      ).toBe(""),
    );
    expect((screen.getByLabelText(/^Valid from/) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/^Valid to/) as HTMLInputElement).value).toBe("");
    expect(
      (screen.getByLabelText(/^Source note/) as HTMLInputElement).value,
    ).toBe("Synthetic demo tariff for electronics.");
  });

  it("confirms deactivate with a dialog and keeps the row", async () => {
    setMockRole("platform_admin");
    renderWithClient(<TariffsClient />);
    await waitForRulesTable();

    fireEvent.click(
      screen.getByRole("button", { name: "Deactivate tariff-v2.3" }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Deactivate tariff rule" }),
    ).toBeTruthy();
    expect(screen.getByText(/there is no delete action/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(
      await screen.findByText("Tariff version tariff-v2.3 deactivated."),
    ).toBeTruthy();
  });

  it("shows the audit tab with who, when, action, before and after", async () => {
    setMockRole("platform_admin");
    renderWithClient(<TariffsClient />);
    await waitForRulesTable();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Audit" }));

    const table = await screen.findByRole("table", { name: "Audit logs" });
    await waitFor(() =>
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(1),
    );

    for (const header of ["When", "Actor", "Action", "Entity", "Before", "After"]) {
      expect(within(table).getByText(header)).toBeTruthy();
    }
    expect(within(table).getAllByText(/tariff_rule/).length).toBeGreaterThan(0);
  });

  it("shows the permission page for an importer", async () => {
    setMockRole("importer_exporter");
    renderWithClient(<TariffsClient />);

    expect((await screen.findAllByText("Access denied")).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("You do not have permission to view this page.")
        .length,
    ).toBeGreaterThan(0);
  });
});
