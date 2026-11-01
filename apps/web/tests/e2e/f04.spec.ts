import { test, expect } from "@playwright/test";

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
    await page.click('a[href*="/shipments/ship_"]:has-text("SHIP-2026-001")');
    await page.waitForURL(/\/shipments\/ship_/);

    // Header
    await expect(page.locator("h1")).toContainText("SHIP-2026-001");
    await expect(page.getByText("Submitted")).toBeVisible();

    // Edit button visible for importer
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record event" }),
    ).not.toBeVisible();

    // Fields panel
    await expect(page.getByText("Shipment details")).toBeVisible();
    await expect(page.getByText("Port", { exact: true })).toBeVisible();
    await expect(page.getByText("Reference", { exact: true })).toBeVisible();

    // Prediction card
    await expect(
      page.getByRole("button", { name: "Run prediction" }),
    ).toBeDisabled();

    await page.screenshot({
      path: "test-results/f04-submitted-importer.png",
      fullPage: true,
    });
  });

  test("submitted shipment as operator shows Record event button", async ({
    page,
  }) => {
    // Switch to operator role
    await page.goto("/dev/sandbox");
    await page.selectOption('select[aria-label="Role"]', "port_operator");

    await page.goto("/shipments");
    await page.click('a[href*="/shipments/ship_"]:has-text("SHIP-2026-001")');
    await page.waitForURL(/\/shipments\/ship_/);

    // Record event button visible for operator
    await expect(
      page.getByRole("button", { name: "Record event" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).not.toBeVisible();

    // Open Record event sheet
    await page.click('button:has-text("Record event")');
    await expect(page.getByText("Record a status change")).toBeVisible();
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

    // Find a cleared shipment
    const clearedLink = page.locator('a[href*="/shipments/ship_"]').filter({
      has: page.locator('text="Cleared"'),
    }).first();

    await clearedLink.click();
    await page.waitForURL(/\/shipments\/ship_/);

    // Predicted vs Actual card
    await expect(page.getByText("Predicted vs Actual")).toBeVisible();
    await expect(page.getByText("Estimate")).toBeVisible();
    await expect(page.getByText("Recorded")).toBeVisible();

    // Timeline with events
    await expect(page.getByText("Timeline")).toBeVisible();
    await expect(page.getByText("Status changed to")).toBeVisible();

    await page.screenshot({
      path: "test-results/f04-cleared-shipment.png",
      fullPage: true,
    });
  });

  test("409 conflict on event recording shows error message", async ({
    page,
  }) => {
    // Switch to operator role
    await page.goto("/dev/sandbox");
    await page.selectOption('select[aria-label="Role"]', "port_operator");

    // Navigate to a shipment with mock error
    await page.goto("/shipments/ship_001?mock_error=409");

    // Open Record event sheet
    await page.click('button:has-text("Record event")');

    // Select status and submit
    const select = page.locator('select').first();
    await select.selectOption("arrived");
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
    await page.goto("/shipments");
    const firstLink = page.locator('a[href*="/shipments/ship_"]').first();
    await firstLink.click();
    await page.waitForURL(/\/shipments\/ship_/);

    const timeline = page.locator('text="Timeline"').locator("..");
    await expect(timeline).toBeVisible();

    // Check for time display
    await expect(timeline.locator("text=/\\d{1,2}:\\d{2}/")).toBeVisible();
  });

  test("Run prediction button is disabled with F05 tooltip", async ({
    page,
  }) => {
    await page.goto("/shipments");

    // Find a shipment without prediction
    const shipmentLink = page.locator('a[href*="/shipments/ship_"]').filter({
      has: page.locator('text="Not predicted yet"'),
    }).first();

    await shipmentLink.click();
    await page.waitForURL(/\/shipments\/ship_/);

    const runButton = page.getByRole("button", { name: "Run prediction" });
    await expect(runButton).toBeDisabled();
    await expect(runButton).toHaveAttribute("title", "Available after F05");
  });
});
