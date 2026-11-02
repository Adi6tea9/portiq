import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', "test@example.com");
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("/dashboard");
}

async function openDashboard(page: Page, query = "") {
  await page.goto(`/dashboard${query}`);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function capture(page: Page, name: string, selector?: string) {
  await expect(page.locator("main")).not.toBeEmpty();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  if (selector) {
    await page.locator(selector).screenshot({
      path: `test-results/f07-${name}.png`,
      animations: "disabled",
    });
    return;
  }

  await page.screenshot({
    path: `test-results/f07-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test.describe("F07 - Importer dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders all six cards independently", async ({ page }) => {
    await openDashboard(page);

    for (const title of [
      "Active shipments",
      "Latest indicative cost",
      "Upcoming arrivals (next 7 days)",
      "Latest milestone",
      "Capacity snapshot",
    ]) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }

    await expect(page.getByText("Latest predicted dwell").first()).toBeVisible();
    await expect(page.getByText("Estimate", { exact: true })).toBeVisible();

    // Latest prediction is ship_012: all cost components unavailable.
    await expect(page.getByText("Unavailable").first()).toBeVisible();
    await expect(
      page.getByText("No active customs duty rule matches this shipment."),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: "New shipment" })).toBeVisible();
    await expect(page.getByText(/Vessel berthed/)).toBeVisible();
    await expect(
      page.getByText("Forecast based on synthetic demo data"),
    ).toBeVisible();

    await capture(page, "full");
  });

  test("shows empty states for a new user with no shipments", async ({
    page,
  }) => {
    await openDashboard(page, "?mock_empty=1");

    await expect(page.getByText("No shipments yet.")).toBeVisible();
    await expect(
      page.getByText("Create your first shipment to get an estimate."),
    ).toBeVisible();
    await expect(page.getByText("No prediction yet.")).toHaveCount(2);
    await expect(page.getByText("No arrivals in the next 7 days.")).toBeVisible();
    await expect(page.getByText("No milestone recorded yet.")).toBeVisible();

    await capture(page, "empty");
  });

  test("keeps the other cards when the capacity card fails", async ({
    page,
  }) => {
    await openDashboard(page, "?mock_capacity_error=503");

    await expect(
      page.getByText("Unable to load the capacity snapshot"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

    await expect(page.getByText("Active shipments")).toBeVisible();
    await expect(page.getByText("Latest indicative cost")).toBeVisible();
    await expect(page.getByText(/Vessel berthed/)).toBeVisible();

    await capture(page, "capacity-error");
  });

  test("shows the partial cost breakdown", async ({ page }) => {
    await openDashboard(page, "?mock_latest_shipment=ship_002");

    await expect(page.getByText("₹93,000.00")).toBeVisible();
    await expect(page.getByText("Demurrage", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "No demurrage rule found for shipping line Line B and cargo type reefer.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Indicative total. Some components could not be calculated.",
      ),
    ).toBeVisible();

    await capture(page, "partial-cost", '[data-testid="latest-cost-card"]');
  });
});
