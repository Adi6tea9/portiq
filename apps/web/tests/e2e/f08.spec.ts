import { expect, test, type Page } from "@playwright/test";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

async function authenticate(
  page: Page,
  role: "importer_exporter" | "port_operator" | "platform_admin",
  path: string,
) {
  await page.goto("/login");
  await page.evaluate((nextRole) => {
    window.sessionStorage.setItem("portiq.mock.auth", "1");
    window.localStorage.setItem("portiq.mock.role", nextRole);
  }, role);
  await page.goto(path);
}

async function openOperator(page: Page) {
  await authenticate(page, "port_operator", "/operator");
  await expect(
    page.getByRole("heading", { name: "Operator overview" }),
  ).toBeVisible();
  await expect(page.getByText("Port scope: Nhava Sheva (JNPA), Singapore")).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Operator shipments" }),
  ).toBeVisible();
}

async function capture(page: Page, name: string, selector?: string) {
  await expect(page.locator("main")).not.toBeEmpty();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  if (selector) {
    await page.locator(selector).screenshot({
      path: `test-results/f08-${name}.png`,
      animations: "disabled",
    });
    return;
  }

  await page.screenshot({
    path: `test-results/f08-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test.describe("F08 - Operator overview", () => {
  test("two-port operator sees KPIs, charts, dwell table and at-risk reasons", async ({
    page,
  }) => {
    await openOperator(page);

    for (const label of [
      "Submitted",
      "Arrived",
      "Cleared",
      "Yard utilization",
      "Berth utilization",
      "At risk",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    await expect(
      page.getByText(/First bucket: .* UTC/).first(),
    ).toBeVisible();

    await expect(
      page.getByRole("img", { name: /daily yard utilization percent/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /daily berth utilization percent/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /predicted dwell distribution/i }),
    ).toBeVisible();

    const dwellTable = page.getByRole("table", {
      name: "Dwell distribution table alternative",
    });
    await expect(dwellTable.getByRole("row")).toHaveCount(7);
    await expect(dwellTable.getByText("10–14")).toBeVisible();

    await expect(
      page.getByText("Forecast utilization is above the high threshold."),
    ).toBeVisible();
    await expect(
      page.getByText("Predicted dwell is above the planning threshold."),
    ).toBeVisible();
    await expect(page.getByText("Documentation is incomplete.")).toBeVisible();
    await expect(page.getByText("Reason unavailable")).toBeVisible();

    const table = page.getByRole("table", { name: "Operator shipments" });
    await expect(table.getByRole("row")).toHaveCount(11);
    await expect(table.getByText("Nhava Sheva (JNPA)").first()).toBeVisible();
    await expect(table.getByText("Singapore").first()).toBeVisible();

    await capture(page, "operator");
  });

  test("shows at-risk items with and without API reasons", async ({ page }) => {
    await openOperator(page);

    await expect(page.getByText("Reason unavailable")).toBeVisible();

    const withReasons = page.getByTestId("at-risk-ops_ship_001");
    await expect(
      withReasons.getByText(
        "Forecast utilization is above the high threshold.",
      ),
    ).toBeVisible();
    await capture(page, "at-risk-with-reasons", '[data-testid="at-risk-ops_ship_001"]');

    const withoutReasons = page.getByTestId("at-risk-ops_ship_003");
    await expect(withoutReasons.getByText("Reason unavailable")).toBeVisible();
    await capture(
      page,
      "at-risk-without-reasons",
      '[data-testid="at-risk-ops_ship_003"]',
    );
  });

  test("filters the shipment table on the server and paginates", async ({
    page,
  }) => {
    await openOperator(page);

    const table = page.getByRole("table", { name: "Operator shipments" });
    await expect(page.getByText("Page 1 of 4 · 40 rows")).toBeVisible();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 4 · 40 rows")).toBeVisible();
    await expect(
      page.getByText("Page 2 of 4 · 40 rows"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page.getByText("Page 1 of 4 · 40 rows")).toBeVisible();

    await page.locator("#operator-status").selectOption("submitted");
    await page.fill("#operator-arrival-from", isoDate(-6));
    await page.fill("#operator-arrival-to", isoDate(10));
    await page.fill("#operator-min-dwell", "5");

    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname.endsWith("/operator/shipments") &&
        url.searchParams.get("status") === "submitted" &&
        url.searchParams.get("min_predicted_dwell_days") === "5" &&
        url.searchParams.get("warning_code") === "TARIFF_MISSING"
      );
    });

    await page.locator("#operator-warning").selectOption("TARIFF_MISSING");
    await filtered;

    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table.getByRole("link", { name: "OPS-2026-002" })).toBeVisible();
    await expect(table.getByText("Tariff Missing")).toBeVisible();

    await capture(page, "filters");
  });

  test("importer gets the permission page on /operator", async ({ page }) => {
    await authenticate(page, "importer_exporter", "/operator");

    await expect(page.getByText("Access denied")).toBeVisible();
    await expect(
      page.getByText("You do not have permission to view this page."),
    ).toBeVisible();

    await capture(page, "permission");
  });

  test("platform admin can open the overview", async ({ page }) => {
    await authenticate(page, "platform_admin", "/operator");

    await expect(
      page.getByRole("heading", { name: "Operator overview" }),
    ).toBeVisible();
    await expect(page.getByText("Reason unavailable")).toBeVisible();
  });
});
