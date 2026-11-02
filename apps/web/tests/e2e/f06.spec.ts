import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', "test@example.com");
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("/dashboard");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * DAY_MS).toISOString().slice(0, 10);
}

const FROM = isoDate(0);
const TO = isoDate(30);
const OVER_RANGE_TO = isoDate(44);

async function openRange(page: Page, path = "/capacity") {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Capacity forecast" })).toBeVisible();
  await page.fill("#capacity-from", FROM);
  await page.fill("#capacity-to", TO);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("main")).not.toBeEmpty();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `test-results/f06-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test.describe("F06 - Capacity forecast", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("shows a 30-day yard forecast with chart, table and legend", async ({
    page,
  }) => {
    await openRange(page);

    await expect(page.locator("tbody tr")).toHaveCount(30);
    await expect(
      page.getByRole("img", { name: /daily yard utilization percent/i }),
    ).toBeVisible();
    await expect(page.getByText("Daily yard utilization (%)")).toBeVisible();

    for (const text of [
      "Lower",
      "below 60%",
      "Moderate",
      "from 60%",
      "High",
      "from 85%",
      "Forecast based on synthetic demo data",
    ]) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }

    await expect(page.getByText(/Forecast generated at/)).toBeVisible();

    const table = page.getByRole("table");
    for (const header of [
      "Start",
      "Occupied",
      "Capacity",
      "Utilization",
      "Source",
      "Version",
    ]) {
      await expect(
        table.getByRole("columnheader", { name: header }),
      ).toBeVisible();
    }

    await capture(page, "30-day-yard");
  });

  test("switches to the berth tab", async ({ page }) => {
    await openRange(page);

    await page.getByRole("tab", { name: "Berth" }).click();

    await expect(
      page.getByRole("tab", { name: "Berth" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Daily berth utilization (%)")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(30);
    await expect(page.getByRole("table").getByText("120").first()).toBeVisible();

    await capture(page, "berth");
  });

  test("shows the empty state", async ({ page }) => {
    await openRange(page, "/capacity?mock_empty=1");

    await expect(
      page.getByText("No forecast is available for this range."),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    await capture(page, "empty");
  });

  test("skips an invalid bucket and shows the note", async ({ page }) => {
    await openRange(page, "/capacity?mock_invalid=1");

    await expect(page.getByText("1 bucket could not be shown")).toBeVisible();
    await expect(
      page.getByText("No forecast is available for this range."),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    await capture(page, "invalid");
  });

  test("blocks a range longer than the config maximum", async ({ page }) => {
    await openRange(page);

    await page.fill("#capacity-to", OVER_RANGE_TO);
    await page.locator("#capacity-to").blur();

    await expect(
      page.getByText("The date range cannot exceed 31 days."),
    ).toBeVisible();
    await expect(page.locator("#capacity-to")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByRole("table")).toHaveCount(0);

    await capture(page, "over-range");
  });
});
