import { test, expect, type Page } from "@playwright/test";

async function setMockRole(
  page: Page,
  role: "importer_exporter" | "port_operator" | "platform_admin",
) {
  await page.evaluate((nextRole) => {
    window.localStorage.setItem("portiq.mock.role", nextRole);
  }, role);
  await page.reload();
}

test.describe("F04 - Shipment detail, timeline, edit, events", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");
  });

  test("submitted shipment as importer shows Edit button and fields", async ({
    page,
  }) => {
    await page.goto("/shipments");
    await page.getByRole("link", { name: "SHIP-2026-001" }).click();
    await page.waitForURL(/\/shipments\/ship_/);

    // Header: reference, actual status, port
    const header = page.getByRole("heading", { level: 1 }).locator("..");
    await expect(header).toContainText("SHIP-2026-001");
    await expect(header.getByText("Submitted", { exact: true })).toBeVisible();
    await expect(header.getByText("Port: Nhava Sheva (JNPA)")).toBeVisible();

    // Edit button visible for importer
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record event" }),
    ).not.toBeVisible();

    // Fields panel
    await expect(page.getByText("Shipment details")).toBeVisible();
    await expect(page.getByText("Port", { exact: true })).toBeVisible();
    await expect(page.getByText("Reference", { exact: true })).toBeVisible();

    // Prediction card (run action is covered by the disabled-button test below)
    await expect(page.getByText("Estimated dwell")).toBeVisible();
    await expect(page.getByText("Estimated cost")).toBeVisible();

    await page.screenshot({
      path: "test-results/f04-submitted-importer.png",
      fullPage: true,
    });
  });

  test("submitted shipment as operator shows Record event button", async ({
    page,
  }) => {
    await setMockRole(page, "port_operator");

    await page.goto("/shipments/ship_001");

    // Record event button visible for operator
    await expect(
      page.getByRole("button", { name: "Record event" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).not.toBeVisible();

    // Open Record event sheet
    await page.click('button:has-text("Record event")');
    await expect(page.getByText("Record status change")).toBeVisible();
    await expect(
      page.getByText(/Current: Submitted\. Allowed next: Arrived/),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/f04-submitted-operator.png",
      fullPage: true,
    });
  });

  test("cleared shipment shows Predicted vs Actual comparison", async ({
    page,
  }) => {
    await page.goto("/shipments");

    const clearedRow = page
      .getByRole("row")
      .filter({ hasText: "Cleared" })
      .first();
    await clearedRow.getByRole("link").click();
    await page.waitForURL(/\/shipments\/ship_/);

    // Predicted vs Actual card
    await expect(page.getByText("Predicted vs Actual")).toBeVisible();
    await expect(page.getByText("Estimate", { exact: true })).toBeVisible();
    await expect(page.getByText("Recorded", { exact: true })).toBeVisible();

    // Timeline with events
    await expect(page.getByText("Timeline")).toBeVisible();
    await expect(page.getByText("Status changed to").first()).toBeVisible();

    await page.screenshot({
      path: "test-results/f04-cleared-shipment.png",
      fullPage: true,
    });
  });

  test("409 conflict on event recording shows error message", async ({
    page,
  }) => {
    await setMockRole(page, "port_operator");

    // Only the event POST is forced to fail; the shipment itself still loads.
    await page.goto("/shipments/ship_001?mock_event_error=409");

    // Open Record event sheet
    await page.click('button:has-text("Record event")');

    // Select status and submit
    await page.locator("select").first().selectOption("arrived");
    await page.click('button:has-text("Save")');

    // Check error message
    await expect(
      page.getByText("That status change is not allowed."),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/f04-409-conflict.png",
      fullPage: true,
    });
  });

  test("not found state for unknown shipment", async ({ page }) => {
    await page.goto("/shipments/unknown_shipment_id");

    await expect(page.getByText("Shipment not found")).toBeVisible();
    await expect(
      page.getByText(
        "This shipment doesn't exist or you don't have access to it.",
      ),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/f04-not-found.png",
      fullPage: true,
    });
  });

  test("timeline shows occurred vs recorded time when different", async ({
    page,
  }) => {
    await page.goto("/shipments/ship_003");

    await expect(page.getByText("Timeline")).toBeVisible();
    await expect(page.getByText(/\(recorded:/i).first()).toBeVisible();
    await expect(page.locator("time").first()).toBeVisible();

    const timeText = await page.locator("time").first().innerText();
    expect(timeText).toMatch(/\d{1,2}:\d{2}/);
  });

  test("Run prediction button is enabled for a shipment without a prediction", async ({
    page,
  }) => {
    await page.goto("/shipments");

    const notPredictedRow = page
      .getByRole("row")
      .filter({ hasText: "Not predicted yet" })
      .first();
    await notPredictedRow.getByRole("link").click();
    await page.waitForURL(/\/shipments\/ship_/);

    const runButton = page.getByRole("button", { name: "Run prediction" });
    await expect(runButton).toBeEnabled();
  });
});
