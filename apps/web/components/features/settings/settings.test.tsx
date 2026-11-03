import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, delay, http } from "msw";
import { MeProvider } from "@/components/providers/MeProvider";
import { updateDisplayName } from "@/lib/api/me";
import { server } from "@/lib/mocks/server";
import { setMockRole } from "@/lib/mocks/role";
import { SettingsForm } from "./SettingsForm";

const ME_ENDPOINT = "*/api/v1/me";

function renderSettings(ui: ReactElement = <SettingsForm />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MeProvider>{ui}</MeProvider>
    </QueryClientProvider>,
  );
}

function displayNameInput(): HTMLInputElement {
  return screen.getByLabelText(/^Display name/) as HTMLInputElement;
}

describe("SettingsForm - F10", () => {
  it("shows the saved display name and a read-only role", async () => {
    setMockRole("platform_admin");
    renderSettings();

    await waitFor(() =>
      expect(displayNameInput().value).toBe("Demo Admin"),
    );

    expect(screen.getByText("Platform admin")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /role/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /role/i })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save display name" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("rejects an empty display name without calling the API", async () => {
    setMockRole("importer_exporter");
    let patchCalls = 0;

    server.use(
      http.patch(ME_ENDPOINT, () => {
        patchCalls += 1;
        return HttpResponse.json({ data: {}, meta: { request_id: "req_test" } });
      }),
    );

    renderSettings();
    await waitFor(() => expect(displayNameInput().value).toBe("Demo Importer"));

    fireEvent.change(displayNameInput(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save display name" }));

    expect(await screen.findByText("Enter a display name.")).toBeTruthy();
    expect(patchCalls).toBe(0);
  });

  it("saves only the display name and confirms the update", async () => {
    setMockRole("importer_exporter");
    let sentBody: unknown = null;

    server.use(
      http.patch(ME_ENDPOINT, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({
          data: {
            user_id: "user_imp_001",
            email: "importer@portiq.demo",
            display_name: "Priya Sharma",
            role: "importer_exporter",
            assigned_port_ids: [],
          },
          meta: { request_id: "req_test" },
        });
      }),
    );

    renderSettings();
    await waitFor(() => expect(displayNameInput().value).toBe("Demo Importer"));

    fireEvent.change(displayNameInput(), { target: { value: "  Priya Sharma  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save display name" }));

    expect(await screen.findByText("Display name updated.")).toBeTruthy();
    expect(sentBody).toEqual({ display_name: "Priya Sharma" });
    await waitFor(() => expect(displayNameInput().value).toBe("Priya Sharma"));
  });

  it("sends one request when the save button is clicked twice", async () => {
    setMockRole("importer_exporter");
    let patchCalls = 0;

    server.use(
      http.patch(ME_ENDPOINT, async () => {
        patchCalls += 1;
        await delay(50);
        return HttpResponse.json({
          data: {
            user_id: "user_imp_001",
            email: "importer@portiq.demo",
            display_name: "Double Click",
            role: "importer_exporter",
            assigned_port_ids: [],
          },
          meta: { request_id: "req_test" },
        });
      }),
    );

    renderSettings();
    await waitFor(() => expect(displayNameInput().value).toBe("Demo Importer"));

    fireEvent.change(displayNameInput(), { target: { value: "Double Click" } });

    const save = screen.getByRole("button", { name: "Save display name" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(await screen.findByText("Display name updated.")).toBeTruthy();
    expect(patchCalls).toBe(1);
  });

  it("shows the API error with its request id", async () => {
    setMockRole("importer_exporter");

    server.use(
      http.patch(ME_ENDPOINT, () =>
        HttpResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Something went wrong. Please try again.",
              request_id: "req_fail_settings",
            },
          },
          { status: 500 },
        ),
      ),
    );

    renderSettings();
    await waitFor(() => expect(displayNameInput().value).toBe("Demo Importer"));

    fireEvent.change(displayNameInput(), { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save display name" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeTruthy();
    expect(screen.getByText("Request ID: req_fail_settings")).toBeTruthy();
  });

  it("matches the confirmed PATCH /me contract", async () => {
    setMockRole("importer_exporter");

    await expect(updateDisplayName("   ")).rejects.toMatchObject({
      status: 422,
      details: [{ field: "display_name", issue: "must not be empty" }],
    });

    await expect(updateDisplayName("x".repeat(81))).rejects.toMatchObject({
      status: 422,
      details: [
        { field: "display_name", issue: "must be 80 characters or fewer" },
      ],
    });

    const updated = await updateDisplayName("  Priya Sharma  ");

    expect(updated.display_name).toBe("Priya Sharma");
    expect(updated.role).toBe("importer_exporter");
    expect(updated.email).toBe("importer@portiq.demo");
  });
});
